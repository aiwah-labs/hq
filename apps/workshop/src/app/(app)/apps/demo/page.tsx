import Link from 'next/link';
import { db } from '@hq/db';
import {
  Badge,
  Card,
  CardBody,
  CardFooter,
  CardHeader,
  EmptyStateRow,
  Table,
  TableWrap,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from '@/components/ui';

export const dynamic = 'force-dynamic';

type OrderStatus = 'FULFILLED' | 'OPEN' | 'CANCELLED';

const ORDER_TONE: Record<OrderStatus, 'success' | 'neutral' | 'danger'> = {
  FULFILLED: 'success',
  OPEN:      'neutral',
  CANCELLED: 'danger',
};

function formatPrice(price: number | null): string {
  if (price == null) return '—';
  if (price === 0) return 'Free';
  return `$${price.toLocaleString('en-US', { minimumFractionDigits: 0 })}`;
}

function formatAmount(amount: number): string {
  return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 0 })}`;
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default async function DemoAppPage() {
  const [products, customers, orders] = await Promise.all([
    db.product.findMany({ orderBy: { name: 'asc' } }),
    db.customer.findMany({ orderBy: { name: 'asc' } }),
    db.order.findMany({
      include: { customer: true, product: true },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
  ]);

  const activeProducts  = products.filter((p) => p.status === 'ACTIVE');
  const activeCustomers = customers.filter((c) => c.status === 'ACTIVE');
  const fulfilledOrders = orders.filter((o) => o.status === 'FULFILLED');
  const monthRevenue    = fulfilledOrders.reduce((sum, o) => sum + o.amount, 0);
  const openOrderCount  = orders.filter((o) => o.status === 'OPEN').length;

  const stats = [
    { label: 'Revenue this month', value: formatAmount(monthRevenue), sub: 'Fulfilled orders' },
    { label: 'Open orders',        value: String(openOrderCount),     sub: 'Awaiting fulfilment' },
    { label: 'Active products',    value: String(activeProducts.length),  sub: 'Available for sale' },
    { label: 'Active customers',   value: String(activeCustomers.length), sub: 'Paying accounts' },
  ];

  return (
    <main className="space-y-6" data-testid="demo-app">

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="mb-2 flex items-center gap-2 text-[11px] text-[#8a8f98]">
            <Link href="/dashboard" className="font-medium hover:text-[#0f1011] transition-colors">
              Home
            </Link>
            <span className="text-[#d0d6e0]">/</span>
            <span>Demo App</span>
          </div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-[20px] font-semibold leading-none tracking-[-0.01em] text-[#0f1011]">
              Demo App
            </h1>
            <Badge tone="teal">Example</Badge>
          </div>
          <p className="mt-2 text-[12.5px] text-[#62666d]">
            A sample ecommerce operation built on HQ&rsquo;s object system &mdash;{' '}
            <Link href="/objects" className="text-[#009E85] hover:text-[#007A66] transition-colors">
              customise the schema →
            </Link>
          </p>
        </div>
        <div className="shrink-0 pt-1">
          <Link
            href="/objects/Order/new"
            className="rounded-md bg-[#009E85] px-3 py-1.5 text-[12.5px] font-medium text-white transition-colors hover:bg-[#007A66]"
            data-testid="btn-add-order"
          >
            + Add order
          </Link>
        </div>
      </div>

      {/* ── Stats strip ───────────────────────────────────────────────────── */}
      <div
        className="flex items-stretch overflow-hidden rounded-lg border border-[#e6e8eb] bg-white"
        data-testid="demo-stats"
      >
        {stats.map((s, i) => (
          <div
            key={s.label}
            className={`flex-1 px-4 py-3${i > 0 ? ' border-l border-[#e6e8eb]' : ''}`}
          >
            <p className="text-[10.5px] font-medium uppercase tracking-[0.04em] text-[#8a8f98]">
              {s.label}
            </p>
            <p className="mt-1 text-[22px] font-semibold leading-none tabular-nums tracking-tight text-[#0f1011]">
              {s.value}
            </p>
            <p className="mt-1.5 text-[11px] text-[#8a8f98]">{s.sub}</p>
          </div>
        ))}
      </div>

      {/* ── Orders ────────────────────────────────────────────────────────── */}
      <Card data-testid="demo-orders">
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#0f1011]">
                Orders
              </p>
              <Badge tone="neutral">{orders.length}</Badge>
            </div>
            <Link
              href="/objects/Order"
              className="text-[11.5px] text-[#009E85] hover:text-[#007A66] transition-colors"
            >
              View all →
            </Link>
          </div>
        </CardHeader>
        <CardBody className="p-0">
          <TableWrap>
            <Table>
              <THead>
                <TR>
                  <TH>Order</TH>
                  <TH>Customer</TH>
                  <TH>Product</TH>
                  <TH>Qty</TH>
                  <TH>Amount</TH>
                  <TH>Date</TH>
                  <TH>Status</TH>
                </TR>
              </THead>
              <TBody>
                {orders.length === 0 ? (
                  <EmptyStateRow
                    title="No orders yet"
                    description="Orders will appear here once seeded or created."
                    colSpan={7}
                    data-testid="orders-empty"
                  />
                ) : (
                  orders.map((order) => (
                    <TR
                      key={order.id}
                      className="hover:bg-[#fafbfb] transition-colors duration-100"
                      data-testid={`order-row-${order.id}`}
                    >
                      <TD>
                        <Link
                          href={`/objects/Order/${order.id}`}
                          className="font-mono text-[12px] text-[#62666d] hover:text-[#009E85] transition-colors"
                        >
                          {order.id.slice(-8)}
                        </Link>
                      </TD>
                      <TD>
                        <Link
                          href={`/objects/Customer/${order.customerId}`}
                          className="text-[12.5px] font-medium text-[#0f1011] hover:text-[#009E85] transition-colors"
                        >
                          {order.customer.name}
                        </Link>
                      </TD>
                      <TD>
                        <span className="text-[12.5px] text-[#62666d]">{order.product.name}</span>
                      </TD>
                      <TD>
                        <span className="tabular-nums text-[12.5px] text-[#62666d]">{order.quantity}</span>
                      </TD>
                      <TD>
                        <span className="tabular-nums text-[12.5px] font-medium text-[#0f1011]">
                          {formatAmount(order.amount)}
                        </span>
                      </TD>
                      <TD>
                        <span className="text-[12px] text-[#8a8f98]">{formatDate(order.createdAt)}</span>
                      </TD>
                      <TD>
                        <Badge tone={ORDER_TONE[order.status as OrderStatus]}>
                          {order.status.charAt(0) + order.status.slice(1).toLowerCase()}
                        </Badge>
                      </TD>
                    </TR>
                  ))
                )}
              </TBody>
            </Table>
          </TableWrap>
        </CardBody>
      </Card>

      {/* ── Products + Customers ──────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">

        {/* Products */}
        <Card data-testid="demo-products">
          <CardHeader>
            <div className="flex items-center gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#0f1011]">
                Products
              </p>
              <Badge tone="neutral">{activeProducts.length} active</Badge>
            </div>
          </CardHeader>
          <CardBody className="p-0">
            <TableWrap>
              <Table>
                <THead>
                  <TR>
                    <TH>Name</TH>
                    <TH>Price</TH>
                    <TH>Status</TH>
                  </TR>
                </THead>
                <TBody>
                  {products.length === 0 ? (
                    <EmptyStateRow
                      title="No products yet"
                      description="Add a product to get started."
                      colSpan={3}
                      data-testid="products-empty"
                    />
                  ) : (
                    products.map((product) => (
                      <TR
                        key={product.id}
                        className="hover:bg-[#fafbfb] transition-colors duration-100"
                        data-testid={`product-row-${product.id}`}
                      >
                        <TD>
                          <Link
                            href={`/objects/Product/${product.id}`}
                            className="text-[12.5px] font-medium text-[#0f1011] hover:text-[#009E85] transition-colors"
                          >
                            {product.name}
                          </Link>
                        </TD>
                        <TD>
                          <span className="tabular-nums text-[12.5px] text-[#62666d]">
                            {formatPrice(product.price)}
                            {product.price && product.price > 0 && (
                              <span className="ml-0.5 text-[11px] text-[#8a8f98]">/mo</span>
                            )}
                          </span>
                        </TD>
                        <TD>
                          <Badge tone={product.status === 'ACTIVE' ? 'success' : 'neutral'}>
                            {product.status === 'ACTIVE' ? 'Active' : 'Archived'}
                          </Badge>
                        </TD>
                      </TR>
                    ))
                  )}
                </TBody>
              </Table>
            </TableWrap>
          </CardBody>
          <CardFooter>
            <Link
              href="/objects/Product"
              className="text-[12px] font-medium text-[#009E85] hover:text-[#007A66] transition-colors"
            >
              View all in Objects →
            </Link>
          </CardFooter>
        </Card>

        {/* Customers */}
        <Card data-testid="demo-customers">
          <CardHeader>
            <div className="flex items-center gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#0f1011]">
                Customers
              </p>
              <Badge tone="neutral">{activeCustomers.length} active</Badge>
            </div>
          </CardHeader>
          <CardBody className="p-0">
            <TableWrap>
              <Table>
                <THead>
                  <TR>
                    <TH>Name</TH>
                    <TH>Email</TH>
                    <TH>Status</TH>
                  </TR>
                </THead>
                <TBody>
                  {customers.length === 0 ? (
                    <EmptyStateRow
                      title="No customers yet"
                      description="Add a customer to get started."
                      colSpan={3}
                      data-testid="customers-empty"
                    />
                  ) : (
                    customers.map((customer) => (
                      <TR
                        key={customer.id}
                        className="hover:bg-[#fafbfb] transition-colors duration-100"
                        data-testid={`customer-row-${customer.id}`}
                      >
                        <TD>
                          <Link
                            href={`/objects/Customer/${customer.id}`}
                            className="text-[12.5px] font-medium text-[#0f1011] hover:text-[#009E85] transition-colors"
                          >
                            {customer.name}
                          </Link>
                        </TD>
                        <TD>
                          <span className="text-[12px] text-[#62666d]">{customer.email ?? '—'}</span>
                        </TD>
                        <TD>
                          <Badge tone={customer.status === 'ACTIVE' ? 'success' : 'neutral'}>
                            {customer.status === 'ACTIVE' ? 'Active' : 'Inactive'}
                          </Badge>
                        </TD>
                      </TR>
                    ))
                  )}
                </TBody>
              </Table>
            </TableWrap>
          </CardBody>
          <CardFooter>
            <Link
              href="/objects/Customer"
              className="text-[12px] font-medium text-[#009E85] hover:text-[#007A66] transition-colors"
            >
              View all in Objects →
            </Link>
          </CardFooter>
        </Card>

      </div>

      {/* ── About this demo ───────────────────────────────────────────────── */}
      <Card>
        <CardBody>
          <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-[#8a8f98]">
            About this demo
          </p>
          <p className="mt-1.5 text-[12.5px] text-[#62666d]">
            All data — customers, products, and orders — are real database records connected to
            HQ&rsquo;s object system. Edit, filter, and automate any of them from the Objects page
            or build workflows on top.
          </p>
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5">
            <Link href="/objects/Order"    className="text-[12px] text-[#009E85] hover:text-[#007A66] transition-colors">→ Manage orders</Link>
            <Link href="/objects/Product"  className="text-[12px] text-[#009E85] hover:text-[#007A66] transition-colors">→ Manage products</Link>
            <Link href="/objects/Customer" className="text-[12px] text-[#009E85] hover:text-[#007A66] transition-colors">→ Manage customers</Link>
            <Link href="/workflows"        className="text-[12px] text-[#009E85] hover:text-[#007A66] transition-colors">→ Automate with Workflows</Link>
          </div>
        </CardBody>
      </Card>

    </main>
  );
}
