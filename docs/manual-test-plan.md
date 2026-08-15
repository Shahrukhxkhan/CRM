# SoloFlow CRM — Manual Test Plan

## Authentication and owner isolation

Sign in, open each primary navigation route, and confirm the workspace header shows the current account. Sign out from the profile menu and confirm that protected content returns to the sign-in screen. To verify owner isolation, create records in two separate accounts and confirm that no list, search result, detail route, or direct URL exposes the other account’s records.

## Lead and company workflow

Create a lead with only a name and confirm it appears in the **New** column. Edit the lead, supply an invalid email or negative estimated value, and confirm that the relevant field shows an inline correction message while other input is preserved. Then create a company, associate the lead to it, and confirm the company detail page lists the contact. Test stage updates by drag-and-drop, the stage select, and focusing a lead card then using **Alt + Left/Right Arrow**.

## Activities, follow-ups, and quotes

From a contact page, log several activity types and confirm newest occurrence time appears first. Create a follow-up, test Active, Today, Overdue, Upcoming, and Completed filters, then complete and reopen the item. Create a quote with two line items; confirm the detail total equals the sum of the item totals, then change its status. Test every destructive action by opening its confirmation dialog and cancelling once before confirming it.

## Responsive and error-state checks

At desktop and mobile widths, verify the navigation remains reachable, no page has horizontal overflow, buttons and selects receive a visible keyboard focus indicator, and empty states explain the next useful action. Temporarily disconnect the network in browser developer tools and confirm list and mutation failures surface a retry panel or a clear toast rather than silently failing.
