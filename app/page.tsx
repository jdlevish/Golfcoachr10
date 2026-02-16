import CsvUploader from '@/components/csv-uploader';

export default function HomePage() {
  return (
    <main className="page">
      <header>
        <p className="eyebrow">Golfcoachr10</p>
        <h1>Garmin R10 Range Session Importer</h1>
        <p>
          This starter app lets you upload exported CSV files from Garmin R10 sessions and see quick
          summaries by shot and club.
        </p>
      </header>

      <CsvUploader />
    </main>
  );
}
