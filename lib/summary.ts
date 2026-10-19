import { driverCommission, type Expense, type Revenue, type Trip } from "./finance";

export const MONTHS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

export function tripCost(trip: Trip) {
  return trip.oil + trip.diesel + trip.toll + trip.extras + driverCommission(trip);
}

export function tripProfit(trip: Trip) {
  return trip.freight - tripCost(trip);
}

// Percentual do peso carregado que não chegou ao destino; null quando faltam os pesos.
export function loadLoss(trip: Trip) {
  if (!trip.loadedWeight || trip.deliveredWeight == null) return null;
  return Math.max(0, ((trip.loadedWeight - trip.deliveredWeight) / trip.loadedWeight) * 100);
}

export function resultLabel(value: number) {
  return value < 0 ? "Prejuízo" : value > 0 ? "Lucro" : "Resultado";
}

export function totals(trips: Trip[], expenses: Expense[], revenues: Revenue[]) {
  const tripCosts = trips.reduce((sum, trip) => sum + tripCost(trip), 0);
  const extraCosts = expenses.reduce((sum, expense) => sum + expense.amount, 0);
  const revenue = trips.reduce((sum, trip) => sum + trip.freight, 0) + revenues.reduce((sum, item) => sum + item.amount, 0);
  const costs = tripCosts + extraCosts;
  const profit = revenue - costs;
  const margin = revenue ? (profit / revenue) * 100 : 0;
  const totalKm = trips.reduce((sum, trip) => sum + trip.km, 0);
  return { tripCosts, extraCosts, revenue, costs, profit, margin, totalKm };
}

export function monthlySeries(trips: Trip[], expenses: Expense[], revenues: Revenue[]) {
  return MONTHS.map((month, index) => {
    const monthTrips = trips.filter((trip) => new Date(`${trip.tripDate}T12:00:00`).getMonth() === index);
    const monthExpenses = expenses.filter((expense) => new Date(`${expense.expenseDate}T12:00:00`).getMonth() === index);
    const faturamento =
      monthTrips.reduce((sum, trip) => sum + trip.freight, 0) +
      revenues.filter((item) => Number(item.revenueDate.slice(5, 7)) === index + 1).reduce((sum, item) => sum + item.amount, 0);
    const despesas = monthTrips.reduce((sum, trip) => sum + tripCost(trip), 0) + monthExpenses.reduce((sum, item) => sum + item.amount, 0);
    return { month, Faturamento: faturamento, Despesas: despesas, Resultado: faturamento - despesas };
  });
}

export function expenseBreakdown(trips: Trip[], expenses: Expense[]) {
  const values: Record<string, number> = {
    Abastecimento: trips.reduce((sum, trip) => sum + trip.diesel, 0),
    Pedágio: trips.reduce((sum, trip) => sum + trip.toll, 0),
    Óleo: trips.reduce((sum, trip) => sum + trip.oil, 0),
    Extras: 0,
    "Comissão do motorista": trips.reduce((sum, trip) => sum + driverCommission(trip), 0),
  };
  trips.forEach((trip) => trip.extraItems.forEach((item) => { values[item.category] = (values[item.category] ?? 0) + item.amount; }));
  expenses.forEach((item) => { values[item.category] = (values[item.category] ?? 0) + item.amount; });
  return Object.entries(values).map(([name, value]) => ({ name, value })).filter((item) => item.value > 0).sort((a, b) => b.value - a.value);
}

export function clientSummary(trips: Trip[]) {
  const map = new Map<string, { name: string; trips: number; revenue: number; profit: number; lastTrip: string }>();
  trips.forEach((trip) => {
    const current = map.get(trip.clientName) ?? { name: trip.clientName, trips: 0, revenue: 0, profit: 0, lastTrip: trip.tripDate };
    current.trips += 1;
    current.revenue += trip.freight;
    current.profit += tripProfit(trip);
    if (trip.tripDate > current.lastTrip) current.lastTrip = trip.tripDate;
    map.set(trip.clientName, current);
  });
  return [...map.values()].sort((a, b) => b.revenue - a.revenue);
}
