/**
 * Rename to sample-widget.mjs to enable this plugin.
 */
export default {
  name: "run-summary-widget",
  apiVersion: "v1",
  kind: "widget",
  widgetName: "run_summary",
  async compute(events, artifacts) {
    const byType = events.reduce((acc, event) => {
      acc[event.type] = (acc[event.type] ?? 0) + 1;
      return acc;
    }, {});

    return {
      totalEvents: events.length,
      artifactCount: artifacts.length,
      eventTypeCounts: byType
    };
  }
};
