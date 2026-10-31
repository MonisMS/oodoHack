// Frozen transport contracts. All money is INR decimal strings; dates are YYYY-MM-DD.
export type Id = string;
export type Money = string;
export type DateOnly = string;
export type Timestamp = string;
export type Role = 'ADMIN' | 'STAFF' | 'CUSTOMER';
export type ProductType = 'SERVICE' | 'DIGITAL' | 'PHYSICAL';
export type BillingPeriod = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';
export type SubscriptionStatus = 'DRAFT' | 'QUOTATION' | 'CONFIRMED' | 'ACTIVE' | 'PAUSED' | 'CLOSED';
export type InvoiceStatus = 'DRAFT' | 'CONFIRMED' | 'PARTIALLY_PAID' | 'PAID' | 'CANCELLED';
export type PaymentMethod = 'CASH' | 'BANK_TRANSFER' | 'UPI' | 'CARD';
export type DiscountType = 'FIXED' | 'PERCENTAGE';
export type DiscountScope = 'PRODUCT' | 'SUBSCRIPTION';
export interface ApiErrorBody { error: { code: string; message: string; fields?: Record<string, string[]> } }
export interface Data<T> { data: T }
export interface Page<T> { data: T[]; page: number; pageSize: number; total: number }
export interface Message { message: string }
export interface ListQuery { page?: number; pageSize?: number; search?: string; sortBy?: 'createdAt' | 'name' | 'number' | 'dueDate' | 'nextInvoiceDate' | 'date'; sortOrder?: 'asc' | 'desc' }
export interface SubscriptionQuery extends ListQuery { status?: SubscriptionStatus; customerId?: Id; planId?: Id }
export interface InvoiceQuery extends ListQuery { status?: InvoiceStatus; customerId?: Id; planId?: Id; from?: DateOnly; to?: DateOnly; overdue?: 'true' | 'false' }
export interface PaymentQuery extends ListQuery { invoiceId?: Id; customerId?: Id; method?: PaymentMethod; from?: DateOnly; to?: DateOnly }
export interface ReportQuery { from?: DateOnly; to?: DateOnly; customerId?: Id; planId?: Id; status?: SubscriptionStatus }
export type PortalSubscriptionQuery = ListQuery & { status?: SubscriptionStatus };
export type PortalInvoiceQuery = ListQuery & { status?: InvoiceStatus; overdue?: 'true' | 'false' };
export interface BulkResult { succeeded: number; failed: Array<{ id: Id; code: string; message: string }> }
export interface CancellationInput { reason?: string }
export interface ChangeLinesInput { lines: LineInput[]; reason?: string }
export interface UserUpdateInput { name?: string; isActive?: boolean }
export interface User { id: Id; name: string; email: string; role: Role; isActive: boolean; createdAt: Timestamp }
export interface SignupInput { name: string; email: string; password: string }
export interface LoginInput { email: string; password: string }
export interface ForgotPasswordInput { email: string }
export interface ResetPasswordInput { token: string; password: string }
export type StaffInput = SignupInput;
export interface AuthSession { user: User; token: string; expiresAt: Timestamp }
export interface VariantInput { attribute: string; value: string; extraPrice: Money; isActive?: boolean }
export interface ProductVariant extends Required<VariantInput> { id: Id; productId: Id }
export interface ProductInput { name: string; type: ProductType; salesPrice: Money; costPrice: Money; notes?: string | null; isActive?: boolean; taxIds?: Id[] }
export interface Product extends Omit<ProductInput, 'isActive' | 'taxIds' | 'notes'> { id: Id; isActive: boolean; notes: string | null; taxIds: Id[]; variants: ProductVariant[]; createdAt: Timestamp; updatedAt: Timestamp }
export interface PlanInput { name: string; price: Money; billingPeriod: BillingPeriod; minQuantity: number; availableFrom?: DateOnly | null; availableTo?: DateOnly | null; autoClose: boolean; closableEarly: boolean; pausable: boolean; renewable: boolean; isActive?: boolean; taxIds?: Id[] }
export interface Plan extends Required<PlanInput> { id: Id; createdAt: Timestamp; updatedAt: Timestamp }
export interface TaxInput { name: string; percentage: string; isActive?: boolean; productIds?: Id[]; planIds?: Id[] }
export interface Tax extends Required<TaxInput> { id: Id; createdAt: Timestamp; updatedAt: Timestamp }
export interface DiscountInput { name: string; type: DiscountType; scope: DiscountScope; value: Money; minPurchase?: Money | null; minQuantity?: number | null; startsAt: DateOnly; endsAt?: DateOnly | null; usageLimit?: number | null; isActive?: boolean; productIds?: Id[] }
export interface Discount extends Required<DiscountInput> { id: Id; usedCount: number; createdAt: Timestamp; updatedAt: Timestamp }
export interface DiscountUsage { id: Id; discountId: Id; invoiceId: Id; amount: Money; createdAt: Timestamp }
export interface LineInput { productId: Id; variantId?: Id | null; quantity: number; unitPrice?: Money }
export interface TemplateInput { name: string; planId: Id; validityDays: number; isActive?: boolean; lines: LineInput[] }
export interface TemplateLine extends Omit<LineInput, 'variantId' | 'unitPrice'> { id: Id; templateId: Id; variantId: Id | null; unitPrice: Money | null; position: number }
export interface QuotationTemplate extends Omit<Required<TemplateInput>, 'lines'> { id: Id; planName: string; lines: TemplateLine[]; createdAt: Timestamp; updatedAt: Timestamp }
export interface SubscriptionInput { customerId: Id; planId: Id; startDate: DateOnly; expiryDate?: DateOnly | null; paymentTermsDays: number; notes?: string | null; lines: LineInput[] }
export interface FromTemplateInput { templateId: Id; customerId: Id; startDate: DateOnly; paymentTermsDays: number; notes?: string | null }
export interface SubscriptionLine { id: Id; subscriptionId: Id; productId: Id; variantId: Id | null; description: string; quantity: number; unitPrice: Money; position: number }
export interface SubscriptionEvent { id: Id; subscriptionId: Id; fromStatus: SubscriptionStatus; toStatus: SubscriptionStatus; actorId: Id | null; reason: string | null; createdAt: Timestamp }
export interface Subscription extends Omit<SubscriptionInput, 'expiryDate' | 'notes' | 'lines'> { id: Id; number: string; customerName: string; customerEmail: string; planName: string; planBillingPeriod: BillingPeriod; templateId: Id | null; status: SubscriptionStatus; expiryDate: DateOnly | null; nextInvoiceDate: DateOnly; billingAnchorDay: number; billingAnchorMonth: number; notes: string | null; lines: SubscriptionLine[]; history: SubscriptionEvent[]; allowedTransitions: SubscriptionStatus[]; planPrice: Money | null; cancelAtPeriodEnd: boolean; billingDue: boolean; createdAt: Timestamp; updatedAt: Timestamp }
export interface TransitionInput { to: SubscriptionStatus; reason?: string; renewalExpiryDate?: DateOnly }
export interface TaxSnapshot { taxId: Id; name: string; percentage: string; amount: Money; taxableBase?: Money; grossBase?: Money; discountAmount?: Money; discounts?: { discountId: Id; amount: Money }[] }
export interface InvoiceLine { id: Id; invoiceId: Id; kind: 'CHARGE' | 'DISCOUNT'; productId: Id | null; variantId: Id | null; discountId: Id | null; description: string; quantity: number; unitPrice: Money; subtotal: Money; taxTotal: Money; total: Money; taxes: TaxSnapshot[]; position: number }
export interface Invoice { id: Id; number: string; subscriptionId: Id; customerId: Id; status: InvoiceStatus; periodStart: DateOnly; periodEnd: DateOnly; issueDate: DateOnly; dueDate: DateOnly; customerName: string; customerEmail: string; subtotal: Money; discountTotal: Money; taxTotal: Money; total: Money; amountPaid: Money; outstanding: Money; overdue: boolean; currency: 'INR'; sentAt: Timestamp | null; lastReminderAt: Timestamp | null; reminderCount: number; lines: InvoiceLine[]; payments: Payment[]; discountUsages: DiscountUsage[]; createdAt: Timestamp; updatedAt: Timestamp }
export interface PaymentInput { invoiceId: Id; method: PaymentMethod; amount: Money; date: DateOnly; note?: string | null }
export interface Payment extends Required<PaymentInput> { id: Id; invoiceNumber: string | null; customerName: string | null; recordedById: Id; createdAt: Timestamp }
export interface BillingInput { asOfDate: DateOnly; maxPeriodsPerSubscription?: number }
export interface BillingResult { created: number; skipped: number; failed: number; autoClosed: number; hasMore: boolean; failures: { subscriptionId: Id; code: string; message: string }[] }
export interface ReportSummary { activeSubscriptions: number; revenueCollected: Money; outstanding: Money; overdueCount: number; overdueAmount: Money; revenueByMonth: { month: string; amount: Money }[] }
export interface PortalSummary { activeSubscriptions: number; outstanding: Money; overdueInvoices: number; nextInvoiceDate: DateOnly | null }
// The portal hides staff-only details: no notes, no who/why in history, no payment recorder or note, no dunning history.
export interface PortalSubscription extends Subscription { canScheduleCancellation: boolean; canWithdrawCancellation: boolean }
export type PortalPayment = Omit<Payment, 'recordedById' | 'note' | 'customerName'>;
export interface PortalInvoice extends Omit<Invoice, 'payments'> { payments: PortalPayment[] }
