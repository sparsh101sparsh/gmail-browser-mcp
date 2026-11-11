import fs from "node:fs";
import path from "node:path";
import { expandHome } from "../utils/cookies.js";
const MAX_GMAIL_ATTACHMENT_BYTES = 25 * 1024 * 1024; // 25 MB
export function validateAttachments(attachmentPaths) {
    if (attachmentPaths !== undefined && !Array.isArray(attachmentPaths)) {
        throw new Error("attachment_paths must be an array of file path strings.");
    }
    if (!attachmentPaths || attachmentPaths.length === 0) {
        return { resolvedPaths: [], totalSizeBytes: 0 };
    }
    const resolvedPaths = [];
    let totalSizeBytes = 0;
    for (const rawPath of attachmentPaths) {
        if (!rawPath || typeof rawPath !== "string" || !rawPath.trim()) {
            throw new Error(`Invalid attachment path entry: ${rawPath}`);
        }
        const expanded = expandHome(rawPath);
        const resolved = path.resolve(expanded);
        if (!fs.existsSync(resolved)) {
            throw new Error(`Attachment file does not exist: ${resolved}`);
        }
        const stat = fs.statSync(resolved);
        if (!stat.isFile()) {
            throw new Error(`Attachment path is not a regular file: ${resolved}`);
        }
        if (stat.size === 0) {
            throw new Error(`Attachment file is empty (0 bytes): ${resolved}`);
        }
        totalSizeBytes += stat.size;
        resolvedPaths.push(resolved);
    }
    if (totalSizeBytes > MAX_GMAIL_ATTACHMENT_BYTES) {
        const mb = (totalSizeBytes / (1024 * 1024)).toFixed(2);
        throw new Error(`Total attachments size (${mb} MB) exceeds Gmail's 25MB limit. Please compress files or use Google Drive links.`);
    }
    return { resolvedPaths, totalSizeBytes };
}
export async function attachFilesAndWait(page, attachmentPaths, timeoutMs = 60000) {
    const { resolvedPaths } = validateAttachments(attachmentPaths);
    if (resolvedPaths.length === 0)
        return;
    console.error(`[attachments] Attaching ${resolvedPaths.length} file(s) to Gmail composer...`);
    // First check if an input[type="file"] is already attached in the DOM
    let fileInput = page.locator("input[type='file']").first();
    const isInputAttached = await fileInput.isVisible().catch(() => false) ||
        await fileInput.count().then((c) => c > 0).catch(() => false);
    if (!isInputAttached) {
        // Look for attach paperclip button to trigger input injection
        const attachButton = page
            .locator("div[aria-label*='Attach files' i], div[command='Files'], div[data-tooltip*='Attach' i]")
            .first();
        const isBtnVisible = await attachButton.isVisible().catch(() => false);
        if (isBtnVisible) {
            const [fileChooser] = await Promise.all([
                page.waitForEvent("filechooser", { timeout: 10000 }).catch(() => null),
                attachButton.click().catch(() => { }),
            ]);
            if (fileChooser) {
                await fileChooser.setFiles(resolvedPaths);
                console.error(`[attachments] Set ${resolvedPaths.length} file(s) via file chooser event.`);
            }
            else {
                // Fallback: look for newly attached input[type="file"]
                fileInput = page.locator("input[type='file']").first();
                await fileInput.waitFor({ state: "attached", timeout: 10000 });
                await fileInput.setInputFiles(resolvedPaths);
                console.error(`[attachments] Set input files on locator.`);
            }
        }
        else {
            // Direct wait for input[type="file"]
            await fileInput.waitFor({ state: "attached", timeout: 15000 });
            await fileInput.setInputFiles(resolvedPaths);
            console.error(`[attachments] Set input files on locator directly.`);
        }
    }
    else {
        await fileInput.setInputFiles(resolvedPaths);
        console.error(`[attachments] Set input files directly on attached input.`);
    }
    // Event-driven progress bar completion
    const progressBarLocator = page.locator("div[role='progressbar'], div[aria-valuenow], div[data-tooltip*='Uploading' i]");
    // If upload progress bar is rendered, wait for it to detach/hide
    const hasProgressBar = await progressBarLocator.count().then((c) => c > 0).catch(() => false);
    if (hasProgressBar) {
        await progressBarLocator.first().waitFor({ state: "hidden", timeout: timeoutMs });
    }
    // Verify attachment chip is present
    const attachmentChip = page.locator("div[role='button'][aria-label*='Attachment' i], div.vI, div.dQ").first();
    await attachmentChip.waitFor({ state: "visible", timeout: 5000 }).catch(() => { });
    // Check for upload error alerts
    const errorAlert = await page
        .locator("div[role='alert'], div[aria-live='assertive']")
        .first()
        .innerText()
        .catch(() => "");
    if (/attachment failed|error uploading|virus detected/i.test(errorAlert)) {
        throw new Error(`Gmail attachment upload failed: ${errorAlert}`);
    }
    console.error(`[attachments] All ${resolvedPaths.length} attachment(s) uploaded successfully.`);
}
//# sourceMappingURL=attachments.js.map