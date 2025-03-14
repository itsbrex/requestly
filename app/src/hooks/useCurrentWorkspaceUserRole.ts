import { useMemo } from "react";
import { useSelector } from "react-redux";
import { getAvailableTeams, getCurrentlyActiveWorkspace } from "store/features/teams/selectors";
import { getUserAuthDetails } from "store/slices/global/user/selectors";
import { Team, TeamRole } from "types";

export const useCurrentWorkspaceUserRole = (): { role: TeamRole | undefined } => {
  const user = useSelector(getUserAuthDetails);
  const availableTeams = useSelector(getAvailableTeams) as Team[] | null;
  const currentlyActiveWorkspace = useSelector(getCurrentlyActiveWorkspace);

  const teamDetails = useMemo(() => availableTeams?.find((team) => team.id === currentlyActiveWorkspace.id), [
    availableTeams,
    currentlyActiveWorkspace.id,
  ]);

  if (!user.loggedIn) {
    return { role: TeamRole.admin };
  }

  // Private workspace
  if (currentlyActiveWorkspace.id === null) {
    return { role: TeamRole.admin };
  }

  const role = teamDetails?.members?.[user?.details?.profile?.uid]?.role;
  return { role: role };
};
