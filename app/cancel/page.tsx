import Link from "next/link";

export default function CancelPage() {
  return (
    <main className="min-h-screen bg-neutral-50 px-6 py-16 text-neutral-900">
      <div className="mx-auto flex w-full max-w-2xl flex-col items-center rounded-3xl border border-neutral-200 bg-white p-8 text-center shadow-sm">
        <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-amber-100 text-3xl">
          !
        </div>

        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Pagamento cancelado
        </h1>

        <p className="mt-4 max-w-xl text-base leading-7 text-neutral-600">
          Nenhuma cobrança foi concluída. Você pode voltar e refazer a reserva quando quiser, sem
          prejuízo.
        </p>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-full bg-black px-6 py-3 text-sm font-medium text-white transition hover:bg-neutral-800"
          >
            Tentar novamente
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