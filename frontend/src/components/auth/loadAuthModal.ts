let pending: Promise<typeof import("./AuthModal")> | undefined;

// Intent warming and the rendered modal must use the same import boundary.
export function loadAuthModal() {
  return pending ??= import("./AuthModal").catch(error => {
    pending = undefined;
    throw error;
  });
}
