export default function CurrencyAmount({ value }: { value: string }) {
  return <span className="currency-amount"><span className="currency-symbol">€</span><span>{value}</span></span>
}
