import UploadForm from './UploadForm'

export default function AdminUploadPage() {
  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-800 mb-2">Upload Leads</h2>
      <p className="text-gray-500 text-sm mb-8">
        Upload a CSV batch. Tier is detected from the filename (BRONZE → Prime, COPPER → Select, RUBY → Premier, GOLD → Core, SILVER → Essential).
        Duplicate Lead IDs are skipped automatically.
      </p>
      <UploadForm />
    </div>
  )
}
