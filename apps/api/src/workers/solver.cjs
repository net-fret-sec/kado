const { randomInt } = require("node:crypto");
/** Bounded randomized constraint search. RNG injection is confined to direct unit tests. */
function solveDraw(
  ids,
  exclusions,
  noMutual,
  maxNodes,
  timeoutMs,
  rng = randomInt,
) {
  const deadline = performance.now() + timeoutMs;
  let nodes = 0;
  const shuffle = (a) => {
    a = [...a];
    for (let i = a.length - 1; i > 0; i--) {
      const j = rng(i + 1);
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  const forbidden = new Map(ids.map((id) => [id, new Set([id])]));
  for (const e of exclusions)
    forbidden.get(e.giverParticipantId)?.add(e.receiverParticipantId);
  const remaining = new Set(shuffle(ids)),
    used = new Set(),
    assignments = new Map();
  function search() {
    if (++nodes > maxNodes || performance.now() >= deadline)
      throw new Error("DRAW_COMPUTATION_LIMIT");
    if (!remaining.size) return true;
    let giver, candidates;
    for (const id of remaining) {
      const choices = ids.filter(
        (receiver) =>
          !used.has(receiver) &&
          !forbidden.get(id).has(receiver) &&
          !(noMutual && assignments.get(receiver) === id),
      );
      if (!choices.length) return false;
      if (!giver || choices.length < candidates.length) {
        giver = id;
        candidates = choices;
      }
    }
    remaining.delete(giver);
    for (const receiver of shuffle(candidates)) {
      assignments.set(giver, receiver);
      used.add(receiver);
      if (search()) return true;
      assignments.delete(giver);
      used.delete(receiver);
    }
    remaining.add(giver);
    return false;
  }
  return search()
    ? ids.map((giverParticipantId) => ({
        giverParticipantId,
        receiverParticipantId: assignments.get(giverParticipantId),
      }))
    : null;
}
module.exports = { solveDraw };
