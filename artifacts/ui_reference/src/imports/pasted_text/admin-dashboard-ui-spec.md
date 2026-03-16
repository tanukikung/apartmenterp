Design a complete admin dashboard UI for a web-based Apartment ERP system.

Style requirements:
- Enterprise dashboard style
- Inspired by Windows / Microsoft admin tools
- Clean, professional, information-dense
- Avoid Mac-style floating UI
- Avoid Japanese-style clutter
- Clear hierarchy, tables, panels, and toolbars
- Designed for heavy daily operational use

Screen size:
- Desktop first
- 1440px layout
- Sidebar navigation

Color style:
- Neutral background
- Blue as primary action color
- Subtle borders
- Clear table grids

Typography:
- Clear, readable system fonts
- Emphasis on usability over decoration

The system is ADMIN ONLY.
There is no tenant portal.

================================================
APP STRUCTURE
================================================

Sidebar navigation:

Dashboard
Rooms
Tenants
Billing
Invoices
Payments
Chat
Maintenance
Analytics
Audit Logs
System
Settings

================================================
SCREENS TO DESIGN
================================================

1. Admin Dashboard

Purpose:
Quick overview of the building status.

Components:
- KPI cards
  - Occupancy rate
  - Monthly revenue
  - Overdue invoices
  - Open maintenance tickets
- Revenue chart
- Recent payments list
- Recent tenant messages
- Maintenance alerts

Layout:
Top KPI cards
Charts in middle
Activity panels below

================================================

2. Rooms Page

Purpose:
Manage all rooms.

Components:
- Building floor filter
- Room status color indicators
  - occupied
  - vacant
  - maintenance
- Table layout

Columns:
Room number
Floor
Status
Tenant
Rent
Last payment
Actions

Clicking a room opens Room Detail page.

================================================

3. Room Detail Page

Purpose:
Single room management.

Sections:
- Room info
- Tenant info
- Billing history
- Invoice history
- Payment history
- Maintenance tickets
- Chat with tenant

Layout:
Left: room + tenant
Right: tabs for activity

================================================

4. Tenants Page

Purpose:
Manage tenant profiles.

Table columns:
Tenant name
Room
Phone
LINE status
Contract start
Contract end
Actions

Search + filter.

================================================

5. Billing Page

Purpose:
Manage monthly billing imports.

Components:
- Excel import button
- Billing list
- Billing preview

Columns:
Billing month
Rooms billed
Total amount
Status

================================================

6. Invoices Page

Purpose:
Invoice management.

Table columns:
Invoice ID
Room
Tenant
Amount
Status
Due date
Actions

Actions:
View
Send via LINE
Download PDF

================================================

7. Payments Page

Purpose:
Review payment matching.

Components:
- Uploaded bank statement
- Matched payments
- Unmatched payments

Two-panel layout:
Left: statements
Right: invoice matches

================================================

8. Chat Page

Purpose:
Communicate with tenants.

Layout:
3 panels

Left:
Conversation list

Middle:
Chat timeline

Right:
Room + tenant info
Quick actions
Send invoice
Send receipt
Send reminder

================================================

9. Maintenance Page

Purpose:
Manage repair tickets.

Columns:
Ticket ID
Room
Issue
Priority
Status
Assigned staff
Created date

================================================

10. Analytics Page

Purpose:
Business insights.

Charts:
Revenue trend
Occupancy
Overdue rate
Maintenance frequency

================================================

11. Audit Logs Page

Purpose:
Track system actions.

Columns:
Timestamp
User
Action
Entity
Details

================================================

12. System Page

Purpose:
System health and maintenance.

Components:
Database health
Queue status
Worker status
Backup status
Run backup button

================================================

Deliverables:
- Complete desktop admin UI
- Sidebar layout
- Tables
- Forms
- Dashboard widgets
- Room detail workflow

Focus on usability and operational efficiency.