import type { CreateParticipantInputDto } from "@kado/shared";
import {
  createParticipant,
  regenerateParticipantAccess,
} from "../services/participant.service";

// Fixtures that need personal access must generate it explicitly, as the organizer does.
export async function createParticipantWithAccess(
  exchangeId: string,
  input: CreateParticipantInputDto,
) {
  const result = await createParticipant(exchangeId, input);
  const { accessLink } = await regenerateParticipantAccess(
    exchangeId,
    result.participant.id,
  );
  return { ...result, accessLink };
}
