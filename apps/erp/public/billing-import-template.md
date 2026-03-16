# Billing Import Excel Template

The system now supports two import layouts:

1. `Summary template`  
One row per room per month. This is the recommended format.

2. `Line-item template`  
One row per billing item. This is the legacy format and is still supported.

## Recommended Summary Template

Use one row per room. A single worksheet is recommended, but the importer also accepts multiple worksheets and merges all rows together.

| Column | Required | Type | Meaning |
|---|---|---|---|
| `Year` | Yes | number | Billing year, for example `2026` |
| `Month` | Yes | number or text | Billing month, for example `12` or `December` |
| `RoomNumber` | Yes | string | Room number, for example `3201` |
| `AccountName` | No | string | Resident or bank account name |
| `BankName` | No | string | Bank name |
| `BankAccountNumber` | No | string | Bank account number |
| `RentAmount` | No | number | Monthly rent amount |
| `WaterPrevious` | No | number | Previous water meter |
| `WaterCurrent` | No | number | Current water meter |
| `WaterUsage` | No | number | Water units used |
| `WaterUnitPrice` | No | number | Water rate per unit |
| `WaterAmount` | No | number | Final water charge |
| `ElectricPrevious` | No | number | Previous electric meter |
| `ElectricCurrent` | No | number | Current electric meter |
| `ElectricUsage` | No | number | Electric units used |
| `ElectricUnitPrice` | No | number | Electric rate per unit |
| `ElectricAmount` | No | number | Final electric charge |
| `FurnitureAmount` | No | number | Furniture or facility charge |
| `ParkingAmount` | No | number | Parking charge |
| `InternetAmount` | No | number | Internet charge |
| `LateFeeAmount` | No | number | Late fee |
| `OtherAmount` | No | number | Other charge |
| `OtherDescription` | No | string | Description for other charge |
| `TotalAmount` | No | number | Human check total from the worksheet |
| `Notes` | No | string | Internal note |

Only columns with a positive amount are turned into billing items.

## Example Summary Row

| Year | Month | RoomNumber | AccountName | BankName | BankAccountNumber | RentAmount | WaterPrevious | WaterCurrent | WaterUsage | WaterUnitPrice | WaterAmount | ElectricPrevious | ElectricCurrent | ElectricUsage | ElectricUnitPrice | ElectricAmount | FurnitureAmount | ParkingAmount | InternetAmount | LateFeeAmount | OtherAmount | OtherDescription | TotalAmount | Notes |
|---|---|---|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---:|---|
| 2026 | December | 3201 | Somchai | KBank | 123-4-56789-0 | 2900 | 2725 | 2734 | 9 | 20 | 200 | 1756 | 1820 | 64 | 9.31 | 596 | 0 | 0 | 0 | 0 | 0 |  | 3696 | Paid by transfer |

This row will create:
- `RENT` = `2900`
- `WATER` = `200`
- `ELECTRIC` = `596`

If `FurnitureAmount` is filled, it is imported as `FACILITY`.
If `OtherAmount` is filled, it is imported as `OTHER`.
`AccountName`, `BankName`, `BankAccountNumber`, and `TotalAmount` are accepted for worksheet compatibility and human review.

## Legacy Line-Item Template

This format is still accepted:

| Room | Year | Month | Type | Quantity | UnitPrice | Description |
|---|---:|---:|---|---:|---:|---|
| 101 | 2026 | 3 | RENT | 1 | 5000 | Monthly rent |
| 101 | 2026 | 3 | WATER | 10 | 15 | Water usage |

## Rules

- Duplicate room-month imports are rejected.
- `Type` must be one of: `RENT`, `WATER`, `ELECTRIC`, `PARKING`, `INTERNET`, `FACILITY`, `FEE_LATE`, `OTHER`
- Empty or zero amounts are ignored in the summary template.
- Meter fields are kept for meaning and traceability, but billing items are created from the final amount columns.
- Summary-template aliases are also accepted, for example `BillingMonth`, `RoomNo`, `Rent`, `WaterCharge`, `ElectricCharge`, `FurnitureCharge`, `LateFee`.
- If `TotalAmount` is filled and does not match the sum of imported billing items, the preview screen shows a warning before import.
