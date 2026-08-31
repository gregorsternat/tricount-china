// D1 accepts at most 100 bound parameters per statement. A share insert binds
// four values per row, so 20 participants leaves headroom for schema changes
// while keeping a single atomic batch statement.
export const MAX_EXPENSE_SHARES = 20;
