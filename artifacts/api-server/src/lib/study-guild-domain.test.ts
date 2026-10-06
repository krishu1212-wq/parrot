import assert from "node:assert/strict";
import test from "node:test";
import {
  findEligibleGuildStudyEvent,
  getEligibleGuildStudyEvents,
  getTournamentDate,
  normalizeGuildJoinCode,
} from "./study-guild-domain";

test("Sunday tournament dates use the app's India-local day and roll forward deterministically", () => {
  assert.equal(getTournamentDate(new Date("2026-10-04T02:00:00.000Z")), "2026-10-04");
  assert.equal(getTournamentDate(new Date("2026-10-04T19:00:00.000Z")), "2026-10-11");
  assert.equal(getTournamentDate(new Date("2026-10-05T00:00:00.000Z")), "2026-10-11");
});

test("join codes normalize safely and reject malformed values", () => {
  assert.equal(normalizeGuildJoinCode(" arise-a1b2c3d4e5 "), "ARISE-A1B2C3D4E5");
  assert.equal(normalizeGuildJoinCode("ARISE-A1B2-C3D4E5"), null);
  assert.equal(normalizeGuildJoinCode("ARISE-12345"), null);
});

test("tournament events must be real, allowed, unique saved events on the Sunday date", () => {
  const history = {
    progressHistory: {
      systemEvents: [
        { id: "lecture-1", type: "lecture.completed", timestamp: "2026-10-04T03:30:00.000Z" },
        { id: "lecture-1", type: "lecture.completed", timestamp: "2026-10-04T04:00:00.000Z" },
        { id: "xp-only", type: "xp.awarded", timestamp: "2026-10-04T04:10:00.000Z" },
        { id: "saturday", type: "study.activity", timestamp: "2026-10-03T18:29:59.000Z" },
        { id: "invalid", type: "study.activity", timestamp: "not-a-date" },
      ],
    },
  };
  const events = getEligibleGuildStudyEvents(history, "2026-10-04");
  assert.deepEqual(events, [{
    id: "lecture-1",
    eventType: "lecture.completed",
    eventDate: "2026-10-04",
    occurredAt: "2026-10-04T03:30:00.000Z",
  }]);
  assert.equal(findEligibleGuildStudyEvent(history, "xp-only", "2026-10-04"), null);
  assert.equal(findEligibleGuildStudyEvent(history, "lecture-1", "2026-10-04")?.id, "lecture-1");
});