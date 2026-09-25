# Plumbing workflow

Plumbing is a separate whole-house lane from electrical conduit and wires.

## First AR authoring slice

`MARKER · PIPE` authors a whole-house node graph. A node is either a free junction
`{x,y,z,floorId}` or a logical fixture port `{markerId,role}` that follows its marker.
Pipe segments join two node ids and carry their service and diameter. Thumbstick up/down
chooses one of four services:

- cold water
- hot water
- heating supply
- heating return

Fixture ports are logical, not spatial model connectors. Their role is inferred from the
service (`cold`, `hot`, `supply`, or `return`), so one radiator or boiler marker can own
both supply and return nodes and both follow the marker when moved.

Available plumbing fixture markers are radiator, boiler, sink, and washing machine.
Trigger a fixture, existing node, or empty space to start the pen. Empty space creates a
free junction; each later trigger creates a segment and advances the pen, enabling bends,
branches, and loops. Grip cycles overlapping markers/nodes, or lifts the pen over empty
space. Trigger an existing pipe with no active pen to select it; thumbstick changes its
service and B/Y deletes it. B/Y on the current free pen node removes that junction and its
incident segments. In ALL FLOORS, nodes and fixtures on every storey can be joined
to create risers.

Colors are blue (cold), red (hot), orange (heating supply), and purple (heating return).

Service is edited as a connected-network property: changing any selected segment retypes
every segment reachable through pipe nodes and updates fixture-port roles. While extending,
the pen/source component is authoritative. Joining a component of another service first
shows the destination component in warning red and makes no change; trigger the same target
again to confirm conversion and connection, or grip to cancel. This prevents an accidental
touch from silently erasing the destination network's service.

## Deferred after the first slice

- diameter editing and reducers
- fixture-specific allowed-role validation
- exact spatial connector offsets on detailed 3D appliances
- valves, manifolds, and connected-network inspection
- print/DXF layers and legends
- wastewater/drainage, which needs slope and flow-direction semantics
