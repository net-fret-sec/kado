interface AssignmentRecord {
  id: string
  exchangeId: string
  giverParticipantId: string
  receiverParticipantId: string
  createdAt: string
}

const assignments = new Map<string, AssignmentRecord>()

export const assignmentRepository = {
  createMany(records: AssignmentRecord[]) {
    for (const record of records) {
      assignments.set(record.id, record)
    }
    return records
  },

  findByExchangeId(exchangeId: string) {
    return Array.from(assignments.values()).filter(a => a.exchangeId === exchangeId)
  },

  findByExchangeAndGiver(exchangeId: string, giverParticipantId: string) {
    return Array.from(assignments.values()).find(
      a => a.exchangeId === exchangeId && a.giverParticipantId === giverParticipantId,
    )
  },

  deleteByExchangeId(exchangeId: string) {
    let deleted = 0
    for (const [id, assignment] of assignments.entries()) {
      if (assignment.exchangeId === exchangeId) {
        assignments.delete(id)
        deleted += 1
      }
    }
    return deleted
  },

  existsForExchange(exchangeId: string) {
    return Array.from(assignments.values()).some(a => a.exchangeId === exchangeId)
  },

  loadTestData(data: { assignments: AssignmentRecord[] }) {
    for (const assignment of data.assignments) {
      assignments.set(assignment.id, assignment)
    }
  },
}
