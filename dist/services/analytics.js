/**
 * Inbox Health & Velocity Analytics Engine
 * Provides statistical analysis and workload health indicators
 * based on live Gmail categorization and unread volumes.
 */
export function computeInboxHealth(stats) {
    const unreadPrimary = stats.unread_primary || 0;
    const categories = stats.categories || {};
    const totalCategoryUnread = (categories.primary || 0) +
        (categories.promotions || 0) +
        (categories.social || 0) +
        (categories.updates || 0);
    const primaryRatio = totalCategoryUnread > 0
        ? Math.round((unreadPrimary / totalCategoryUnread) * 100) / 100
        : 0;
    let score = 100;
    const recommendations = [];
    if (unreadPrimary === 0) {
        return {
            score: 100,
            rating: "Pristine (Zero Inbox)",
            primary_ratio: 0,
            recommendations: ["Inbox zero maintained! No immediate triage needed."],
        };
    }
    // Deduct based on unread primary count
    if (unreadPrimary <= 5) {
        score -= 10;
    }
    else if (unreadPrimary <= 25) {
        score -= 30;
        recommendations.push("Consider processing top 5 actionable threads.");
    }
    else if (unreadPrimary <= 100) {
        score -= 55;
        recommendations.push("High unread volume in Primary tab. Run batch triage.");
    }
    else {
        score -= 75;
        recommendations.push("Critical inbox bloat detected. Archive or filter non-urgent emails.");
    }
    // Deduct if promotions or updates exceed 100
    if ((categories.promotions || 0) > 100) {
        score -= 10;
        recommendations.push("Clean up promotional newsletters to reduce clutter.");
    }
    score = Math.max(10, Math.min(100, score));
    let rating = "Healthy";
    if (score >= 90)
        rating = "Pristine (Zero Inbox)";
    else if (score >= 70)
        rating = "Healthy";
    else if (score >= 45)
        rating = "Moderate";
    else
        rating = "Overwhelmed";
    return {
        score,
        rating,
        primary_ratio: primaryRatio,
        recommendations,
    };
}
//# sourceMappingURL=analytics.js.map