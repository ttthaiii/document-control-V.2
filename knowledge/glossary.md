# Glossary — on-demand term store (T-229)
#
# PURPOSE: persisted term -> plain-Thai gloss so a term explained once is reused
# (same wording) across sessions instead of being re-derived blind.
#
# HARD RULE — grep-only, NEVER always-loaded:
#   This file is read ON DEMAND only — `grep -i "^<term> " knowledge/glossary.md`
#   when a term recurs. It MUST NOT be added to skill-manifest always_loaded /
#   on_demand_files, nor loaded at boot. Always-loaded context was rejected (T-226e:
#   per-turn token weight). One grep per recurring term, not a whole-file load.
#
# FORMAT — one data line per term, pipe-separated, 3 columns:
#   term | plain-Thai gloss | everyday analogy (OPTIONAL — use "-" when none helps)
#   - term (col 1): the technical/English term, stored LOWERCASE (grep is -i / case-insensitive)
#   - NO literal "|" inside gloss/analogy text (it breaks the columns)
#   - analogy is OPTIONAL: only add one when it genuinely clarifies. A forced or
#     mismatched metaphor confuses more than it helps (lesson: the "ถ่ายรูป" case).
#
# APPENDED BY: user-coach §1 USE — when a NEW term is glossed during a task it is
# appended here; on later mention user-coach greps here FIRST and reuses the gloss.
# -----------------------------------------------------------------------------
baseline | จดลิสต์ว่าตอนเริ่มงานมีไฟล์ไหนถูกแก้อยู่บ้าง เก็บไว้เทียบตอนจบว่าเราแตะเกินขอบเขตไหม | เหมือนจดของในตู้เย็นก่อนไปตลาด จะได้รู้ว่าซื้ออะไรเพิ่มมาบ้าง
hook | ตัวดักจังหวะอัตโนมัติ — สคริปต์เล็กๆ ที่รันเองทันทีเมื่อเกิดเหตุการณ์ที่กำหนดไว้ | เหมือนกริ่งประตูที่ดังเองทุกครั้งที่มีคนกด ไม่ต้องมีใครคอยสั่ง
mece | วิธีแบ่งงานเป็นส่วนๆ ที่ไม่ทับกันและรวมแล้วครบทุกด้าน | เหมือนหั่นเค้กให้แต่ละชิ้นไม่ซ้อนกันและไม่เหลือเศษ
grep | คำสั่งค้นหาเฉพาะบรรทัดที่มีคำที่ต้องการในไฟล์ ไม่ต้องเปิดอ่านทั้งไฟล์ | เหมือนกด Ctrl+F หาคำในเอกสาร
idempotent | ทำซ้ำกี่ครั้งผลลัพธ์ก็เหมือนเดิม ไม่พังเพิ่มและไม่ซ้ำซ้อน | เหมือนกดปุ่มปิดไฟที่ปิดอยู่แล้ว กดอีกกี่ทีไฟก็ยังปิดเหมือนเดิม
scope | ขอบเขตงาน — งานนี้ครอบคลุมแค่ไหน แตะอะไรบ้าง ไม่แตะอะไรบ้าง | เหมือนวงที่ตีกรอบไว้ ในวงคือทำ นอกวงคือไม่ทำ
offload | ยกของหนักออกจากพื้นที่ทำงานหลักไปพักไว้ที่อื่น แล้วถือใบอ้างอิงไว้เรียกคืน | ฝากกระเป๋าที่ล็อกเกอร์แล้วถือใบรับ
deterministic | กฎตายตัว — input เดิมได้ผลเดิมทุกครั้ง ไม่มีสุ่ม ไม่มีโมเดลเดา | เครื่องคิดเลข: กด 2+2 ได้ 4 เสมอ
attribution | การให้เครดิตว่าไอเดีย/สูตรมาจากไหน โดยไม่ได้เอาโค้ดเขามาใช้ | เขียนรายงานแล้วใส่บรรณานุกรมอ้างอิงหนังสือ
