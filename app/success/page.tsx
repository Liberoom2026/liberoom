import Link from "next/link";

type SuccessPageProps = {
  searchParams?: {
    session_id?: string;
  };
};

export default function SuccessPage({ searchParams }: SuccessPageProps) {
  const sessionId = searchParams?.session_id ?? null;

  return (
    <main className="min-h-screen bg-neutral-50 px-6 py-16 text-neutral-900">
      <div className="mx-auto flex w-full max-w-2xl flex-col items-center rounded-3xl border border-neutral-200 bg-white p-8 text-center shadow-sm">
        <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-green-100 text-3xl">
          ✓
        </div>

        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Pagamento confirmado
        </h1>

        <p className="mt-4 max-w-xl text-base leading-7 text-neutral-600">
          Sua reserva foi iniciada com sucesso. Agora o sistema vai seguir o fluxo normal de
          confirmação, gravação da reserva e validação dos dados no backend.
        </p>

        {sessionId ? (
          <div className="mt-6 w-full rounded-2xl bg-neutral-100 px-4 py-3 text-left">
            <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
              Session ID
            </p>
            <p className="mt-1 break-all font-mono text-sm text-neutral-700">{sessionId}</p>
          </div>
        ) : null}

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-full bg-black px-6 py-3 text-sm font-medium text-white transition hover:bg-neutral-800"
          >
            Voltar para o início
          </Link>

          <Link
            href="/dashboard"
            className="inline-flex items-center justify-center rounded-full border border-neutral-300 px-6 py-3 text-sm font-medium text-neutral-900 transition hover:bg-neutral-100"
          >
            Ir para o dashboard
          </Link>
        </div>
      </div>
    </main>
  );
}