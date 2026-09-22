export const REFRESH_FAILED_MESSAGE = "Registro salvo, mas a tela não pôde ser atualizada";
export const DELETE_REFRESH_FAILED_MESSAGE = "Registro excluído, mas a tela não pôde ser atualizada";

export type SaveThenRefreshResult =
  | { saved: false; error: unknown }
  | { saved: true; refreshed: boolean };

export type SaveThenRefreshParams = {
  save: () => Promise<unknown>;
  refresh: () => Promise<boolean>;
  close: () => void;
  onSaveFailed: (error: unknown) => void;
};

export async function saveThenRefresh(params: SaveThenRefreshParams): Promise<SaveThenRefreshResult> {
  try {
    await params.save();
  } catch (error) {
    params.onSaveFailed(error);
    return { saved: false, error };
  }
  params.close();
  let refreshed = false;
  try {
    refreshed = await params.refresh();
  } catch {
    refreshed = false;
  }
  return { saved: true, refreshed };
}

export type TripSaveFeedbackParams = {
  saved: boolean;
  refreshed: boolean;
  alert: boolean;
  onSuccess: () => void;
  onLossAlert: () => void;
  onRefreshError: (message: string) => void;
};

export function tripSaveFeedback(params: TripSaveFeedbackParams): void {
  if (!params.saved) return;
  if (params.alert) params.onLossAlert();
  else if (params.refreshed) params.onSuccess();
  if (!params.refreshed) params.onRefreshError(REFRESH_FAILED_MESSAGE);
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Não foi possível concluir a operação. Tente novamente.";
}