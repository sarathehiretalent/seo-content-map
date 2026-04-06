import { Header } from '@/components/layout/header'
import { CreateBrandForm } from '@/components/brand/create-brand-form'

export default function NewBrandPage() {
  return (
    <div>
      <Header
        title="Add New Brand"
        description="Enter your brand details to start SEO analysis"
      />
      <div className="mx-auto max-w-lg p-6">
        <CreateBrandForm />
      </div>
    </div>
  )
}
