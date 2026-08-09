import { describe, expect, it } from "vitest";
import { parseCommand } from "../lib/agent/intents";
import { buildSchedulingProposal, SchedulingProposalError } from "../lib/scheduling-proposal";
import type { AvailableSlot } from "../lib/scheduling-availability";

const parsed = parseCommand(
  "Schedule a meeting called Project kickoff with alice@example.com",
  [],
  {
    accountTimeZone: "Asia/Kolkata",
  },
);

function intent() {
  if (!parsed.ok || parsed.intent.kind !== "schedule") throw new Error("Expected schedule intent");
  return parsed.intent;
}

function slots(): AvailableSlot[] {
  return [
    {
      start: "2026-08-10T04:00:00.000Z",
      end: "2026-08-10T04:30:00.000Z",
      timeZone: "Asia/Kolkata",
      durationMinutes: 30,
      rank: 1,
      reason: "Available for all attendees.",
    },
    {
      start: "2026-08-10T05:00:00.000Z",
      end: "2026-08-10T05:30:00.000Z",
      timeZone: "Asia/Kolkata",
      durationMinutes: 30,
      rank: 2,
      reason: "Available for all attendees.",
    },
  ];
}

describe("buildSchedulingProposal", () => {
  it("creates one event and invitation proposal with alternatives", () => {
    const proposal = buildSchedulingProposal(intent(), slots());
    expect(proposal.event.summary).toBe("Project kickoff");
    expect(proposal.event.start).toBe(slots()[0].start);
    expect(proposal.invitation.attendees).toEqual(["alice@example.com"]);
    expect(proposal.alternatives).toHaveLength(1);
    expect(proposal.email).toBeUndefined();
  });

  it("validates the optional email without sending it", () => {
    const proposal = buildSchedulingProposal(intent(), slots(), {
      to: ["alice@example.com"],
      subject: "Project kickoff",
      body: "Please join.",
    });
    expect(proposal.email).toEqual({
      to: ["alice@example.com"],
      subject: "Project kickoff",
      body: "Please join.",
    });
  });

  it("rejects missing slots and invalid email content", () => {
    expect(() => buildSchedulingProposal(intent(), [])).toThrow(SchedulingProposalError);
    expect(() =>
      buildSchedulingProposal(intent(), slots(), {
        to: ["Alice@example.com"],
        subject: "Subject",
        body: "Body",
      }),
    ).toThrow("invalid recipients");
  });
});
