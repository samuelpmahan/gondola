import json
from pathlib import Path

saved_path = Path("fixtures/compiled/children/evidence/rawlogs/native-trace.json")
fresh_path = Path("compiled-children/coordination/rawlogs/XR-GO-review-native-trace.json")
saved_bytes = saved_path.read_bytes()
fresh_bytes = fresh_path.read_bytes()
assert fresh_bytes == saved_bytes, "fresh Go CLI output differs from author trace bytes"
trace = json.loads(fresh_bytes)
assert trace["schema"] == "gobi.compiled-children-native/v1"
assert len(trace["events"]) == 42 and len(trace["steps"]) == 38
assert [event["index"] for event in trace["events"] if event.get("stepIndex") is None] == [9, 10, 11, 12]
steps = {step["eventIndex"]: step for step in trace["steps"]}
assert [effect["arg"] for effect in steps[14]["effects"]] == ["child:oak:g2:r1"]
assert [effect["arg"] for effect in steps[24]["effects"]] == ["child:oak:g5:r2", "child:elm:g3:r2"]
assert [effect["arg"] for effect in steps[31]["effects"]] == ["child:oak:g7:r1", "child:pine:g6:r1", "parent:g1:r2"]
assert all(
    effect["kind"] == "lifecycle.cancel"
    for index in (14, 24, 31)
    for effect in steps[index]["effects"]
)
stale = steps[17]["state"]
reused_oak = next(child for child in stale["Children"] if child["Key"] == "oak")
assert reused_oak["Generation"] == 5 and reused_oak["Pending"] is True and reused_oak["Reply"] == ""
final = steps[41]["state"]
assert final["Parent"]["Alive"] and final["Parent"]["Generation"] == 8
assert final["Parent"]["Reply"] == "parent:g8:r1"
assert [(child["Key"], child["Generation"], child["Counter"]["Count"], child["Reply"])
        for child in final["Children"]] == [("ash", 9, 1, "child:ash:g9:r1")]

print("fresh trace byte-identical to N1 saved trace")
print("schema=gobi.compiled-children-native/v1 events=42 steps=38")
print("tick_free_event_indexes=9,10,11,12")
print("remove_child_cancels=child:oak:g2:r1")
print("clear_reverse_order=child:oak:g5:r2,child:elm:g3:r2; parent request remains pending")
print("parent_remove_order=child:oak:g7:r1,child:pine:g6:r1,parent:g1:r2")
print("old oak completion leaves reused generation 5 pending with empty reply")
print("final parent generation=8; final child=ash generation 9 count 1 completed")
