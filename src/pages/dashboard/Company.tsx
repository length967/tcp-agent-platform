import { Building2 } from 'lucide-react'

export default function Company() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Company</h1>
      
      <div className="border rounded-lg p-8 text-center">
        <Building2 className="w-12 h-12 text-gray-400 mx-auto mb-4" />
        <h3 className="text-lg font-medium mb-2">Company Settings</h3>
        <p className="text-gray-500">Manage billing, subscription, and company details</p>
      </div>
    </div>
  )
}