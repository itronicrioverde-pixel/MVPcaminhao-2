export const REFRESH_FAILED_MESSAGE = "Registro salvo, mas a tela não pôde ser atualizada";
export const DELETE_REFRESH_FAILED_MESSAGE = "Registro excluído, mas a tela não pôde ser atualizada";

export type SaveThenRefreshResult =
  | { saved: false; error: unknown }
  | { saved: true; refreshed: boolean };

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Não foi possível concluir a operação. Tente novamente.";
}

export async function saveThenRefresh(params: {
  save: () => Promise<unknown>;
  refresh: () => Promise<boolean>;
  close: () => void;
  onSaveFailed: (error: unknown) => void;
}): Promise<SaveThenRefreshResult> {
  try {
    await params.save();
  } catch (error) {
    params.onSaveFailed(error);
    return { saved: false, error };
  }
  let refreshed = false;
  try {
    refreshed = await params.refresh();
  } catch {
    refreshed = false;
  }
  params.close();
  return { saved: true, refreshed };
}