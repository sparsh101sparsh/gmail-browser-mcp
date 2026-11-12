import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { computeInboxHealth } from "../dist/services/analytics.js";

describe("Inbox Health & Velocity Analytics Test Suite", () => {
  test("computes perfect score for Inbox Zero", () => {
    const health = computeInboxHealth({
      unread_primary: 0,
      unread_total: 0,
      categories: { primary: 0, promotions: 0, social: 0, updates: 0 },
      checked_at: new Date().toISOString(),
    });
    assert.strictEqual(health.score, 100);
    assert.strictEqual(health.rating, "Pristine (Zero Inbox)");
    assert.strictEqual(health.recommendations.length, 1);
  });

  test("computes healthy score for low unread volume", () => {
    const health = computeInboxHealth({
      unread_primary: 4,
      unread_total: 10,
      categories: { primary: 4, promotions: 2, social: 1, updates: 3 },
      checked_at: new Date().toISOString(),
    });
    assert.strictEqual(health.score, 90);
    assert.strictEqual(health.rating, "Pristine (Zero Inbox)");
    assert.strictEqual(health.primary_ratio, 0.4);
  });

  test("computes moderate score for medium unread primary", () => {
    const health = computeInboxHealth({
      unread_primary: 20,
      unread_total: 50,
      categories: { primary: 20, promotions: 10, social: 5, updates: 15 },
      checked_at: new Date().toISOString(),
    });
    assert.strictEqual(health.score, 70);
    assert.strictEqual(health.rating, "Healthy");
  });

  test("flags overwhelmed inbox on excessive unread volume", () => {
    const health = computeInboxHealth({
      unread_primary: 150,
      unread_total: 500,
      categories: { primary: 150, promotions: 200, social: 50, updates: 100 },
      checked_at: new Date().toISOString(),
    });
    assert.strictEqual(health.score <= 45, true);
    assert.strictEqual(health.rating === "Overwhelmed" || health.rating === "Moderate", true);
  });
});
