import { describe, expect, it } from "vitest";
import { campaignLabel, type HistoryCampaign } from "@/lib/campaignHistory";
import { cohortRowsToMatrix, type CohortRow } from "@/lib/campaignCohort";

const campaign = {
  id: "c1",
  name: "Workshop FC",
  ref_month: "2026-07",
  start_date: null,
  end_date: null,
  channel: null,
  notes: null,
} as HistoryCampaign;

describe("campaign label in cohort bases", () => {
  it("joins the campaign name with its reference month and year, as the filter does", () => {
    expect(campaignLabel(campaign)).toBe("Workshop FC · 07/2026");
  });

  it("falls back to the bare name when the campaign has no reference month", () => {
    expect(campaignLabel({ ...campaign, ref_month: null })).toBe("Workshop FC");
  });

  it("writes the same label into the Campanha column of the exported matrix", () => {
    const row = {
      id: "r1",
      campaign_id: campaign.id,
      email: "cliente@empresa.com",
      email_norm: "cliente@empresa.com",
      name: null,
      offer: null,
      activated_at: "2026-07-10",
      campaign_name: campaignLabel(campaign),
      result: null,
    } as unknown as CohortRow;

    const matrix = cohortRowsToMatrix([row]);
    expect(matrix[0][3]).toBe("Campanha");
    expect(matrix[1][3]).toBe("Workshop FC · 07/2026");
  });
});
