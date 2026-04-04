import { describe, it, expect } from "vitest";
import {
  chart,
  CHART_COLORS,
  CHART_TOKENS,
  chartAxis,
  chartMuted,
  chartPositive,
  chartNegative,
  chartPrimary,
  withAlpha,
} from "../lib/palette";

describe("palette", () => {
  it("should have 8 chart colors", () => {
    expect(CHART_COLORS).toHaveLength(8);
  });

  it("should have 8 chart tokens matching chart-1 through chart-8", () => {
    expect(CHART_TOKENS).toHaveLength(8);
    expect(CHART_TOKENS[0]).toBe("chart-1");
    expect(CHART_TOKENS[7]).toBe("chart-8");
  });

  it("should produce hsl(var(--...)) format for chart colors", () => {
    expect(chart.violet).toBe("hsl(var(--chart-1))");
    expect(chart.magenta).toBe("hsl(var(--chart-2))");
    expect(chart.acid).toBe("hsl(var(--chart-8))");
  });

  it("should export semantic aliases", () => {
    expect(chartAxis).toBe("hsl(var(--chart-axis))");
    expect(chartMuted).toBe("hsl(var(--chart-muted))");
    expect(chartPositive).toBe("hsl(var(--success))");
    expect(chartNegative).toBe("hsl(var(--destructive))");
    expect(chartPrimary).toBe(chart.violet);
  });

  describe("withAlpha()", () => {
    it("should produce hsl with alpha", () => {
      expect(withAlpha("chart-1", 0.12)).toBe("hsl(var(--chart-1) / 0.12)");
    });

    it("should handle alpha of 1", () => {
      expect(withAlpha("primary", 1)).toBe("hsl(var(--primary) / 1)");
    });

    it("should handle alpha of 0", () => {
      expect(withAlpha("muted", 0)).toBe("hsl(var(--muted) / 0)");
    });
  });
});
