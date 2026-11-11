import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  normalizeCookies,
  validateCookies,
  detectAccountIndex,
  loadCookies,
} from "../dist/utils/cookies.js";

describe("Cookies utility", () => {
  test("normalizes raw Chrome cookie objects", () => {
    const raw = [
      {
        name: "SID",
        value: "secret_sid_token",
        domain: ".google.com",
        path: "/",
        expirationDate: 1800000000.45,
        httpOnly: true,
        secure: true,
        sameSite: "no_restriction",
        session: false,
      },
      {
        name: "GMAIL_AT",
        value: "action_token",
        domain: "mail.google.com",
        path: "/mail/u/1",
        sameSite: "lax",
      },
    ];

    const normalized = normalizeCookies(raw);
    assert.equal(normalized.length, 2);

    assert.equal(normalized[0].name, "SID");
    assert.equal(normalized[0].value, "secret_sid_token");
    assert.equal(normalized[0].domain, ".google.com");
    assert.equal(normalized[0].httpOnly, true);
    assert.equal(normalized[0].secure, true);
    assert.equal(normalized[0].expires, 1800000000);
    assert.equal(normalized[0].sameSite, "None");

    assert.equal(normalized[1].name, "GMAIL_AT");
    assert.equal(normalized[1].path, "/mail/u/1");
    assert.equal(normalized[1].sameSite, "Lax");
  });

  test("validates required auth cookies", () => {
    const validCookies = [
      { name: "SID", value: "a" },
      { name: "HSID", value: "b" },
      { name: "SSID", value: "c" },
      { name: "GMAIL_AT", value: "d" },
    ];
    const validation = validateCookies(validCookies);
    assert.equal(validation.valid, true);
    assert.equal(validation.missing.length, 0);
    assert.equal(validation.expired.length, 0);

    const missingCookies = [{ name: "SID", value: "a" }];
    const invalidValidation = validateCookies(missingCookies);
    assert.equal(invalidValidation.valid, false);
    assert.ok(invalidValidation.missing.includes("GMAIL_AT"));
    assert.ok(invalidValidation.missing.includes("HSID"));
    assert.ok(invalidValidation.missing.includes("SSID"));

    const expiredCookies = [
      { name: "SID", value: "a", expires: 1000 },
      { name: "HSID", value: "b", expires: 2000000000 },
      { name: "SSID", value: "c", expires: 2000000000 },
      { name: "GMAIL_AT", value: "d" },
    ];
    const expiredValidation = validateCookies(expiredCookies);
    assert.equal(expiredValidation.valid, false);
    assert.deepEqual(expiredValidation.expired, ["SID"]);
  });

  test("detects account index from cookie paths", () => {
    const cookiesU1 = [
      { name: "SID", value: "a", domain: ".google.com", path: "/" },
      { name: "GMAIL_AT", value: "b", domain: "mail.google.com", path: "/mail/u/1" },
    ];
    assert.equal(detectAccountIndex(cookiesU1), 1);

    const cookiesU0 = [
      { name: "SID", value: "a", domain: ".google.com", path: "/" },
      { name: "GMAIL_AT", value: "b", domain: "mail.google.com", path: "/mail/u/0" },
    ];
    assert.equal(detectAccountIndex(cookiesU0), 0);

    const cookiesU2 = [
      { name: "COMPASS", value: "c", domain: "mail.google.com", path: "/mail/u/2" },
    ];
    assert.equal(detectAccountIndex(cookiesU2), 2);
  });

  test("respects GMAIL_ACCOUNT_INDEX environment variable override", () => {
    const cookies = [
      { name: "GMAIL_AT", value: "b", domain: "mail.google.com", path: "/mail/u/1" },
    ];
    process.env.GMAIL_ACCOUNT_INDEX = "5";
    try {
      assert.equal(detectAccountIndex(cookies), 5);
    } finally {
      delete process.env.GMAIL_ACCOUNT_INDEX;
    }
  });

  test("supplies default domain if omitted and cleans domain formatting", () => {
    const raw = [
      { name: "foo", value: "bar" },
      { name: "baz", value: "qux", domain: "google.com" },
    ];
    const normalized = normalizeCookies(raw);
    assert.equal(normalized[0].domain, ".google.com");
    assert.equal(normalized[1].domain, ".google.com");
  });

  test("supports expires and expiry aliases and handles millisecond timestamps", () => {
    const raw = [
      { name: "c1", value: "v1", expires: 1900000000 },
      { name: "c2", value: "v2", expiry: 1900000000 },
      { name: "c3", value: "v3", expires: 1900000000000 }, // ms
      { name: "c4", value: "v4", expires: "2028-01-01T00:00:00.000Z" },
    ];
    const normalized = normalizeCookies(raw);
    assert.equal(normalized[0].expires, 1900000000);
    assert.equal(normalized[1].expires, 1900000000);
    assert.equal(normalized[2].expires, 1900000000);
    assert.equal(normalized[3].expires, Math.floor(Date.parse("2028-01-01T00:00:00.000Z") / 1000));
  });

  test("enforces secure=true for SameSite=None and filters invalid entries", () => {
    const raw = [
      { name: "valid", value: "tok", sameSite: "none", secure: false },
      { name: "empty_val", value: "   " },
      { name: "   ", value: "empty_name" },
      null,
      undefined,
      "not an object",
    ];
    const normalized = normalizeCookies(raw);
    assert.equal(normalized.length, 1);
    assert.equal(normalized[0].name, "valid");
    assert.equal(normalized[0].sameSite, "None");
    assert.equal(normalized[0].secure, true);
  });

  test("loads real user cookies file and detects account index 1", () => {
    const defaultPath = path.join(os.homedir(), "Downloads", "mail.google.com_cookies.json");
    if (fs.existsSync(defaultPath)) {
      const session = loadCookies(defaultPath);
      assert.ok(session.cookies.length >= 20, "Should load at least 20 cookies");
      assert.equal(session.accountIndex, 1, "Should correctly auto-detect user account index 1");
      const val = validateCookies(session.cookies);
      assert.ok(val.valid, "User cookies should be valid");
    }
  });
});
