-- Add tsvector column for full-text search on MsgMessage.content
ALTER TABLE "MsgMessage" ADD COLUMN "searchVec" tsvector;

-- GIN index for fast full-text search
CREATE INDEX "MsgMessage_searchVec_idx" ON "MsgMessage" USING GIN ("searchVec");

-- Trigger function to auto-populate searchVec on insert/update
CREATE FUNCTION msg_message_search_update() RETURNS trigger AS $$
BEGIN
  NEW."searchVec" := to_tsvector('english', coalesce(NEW.content, ''));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER msg_message_search_trigger
BEFORE INSERT OR UPDATE OF content ON "MsgMessage"
FOR EACH ROW EXECUTE FUNCTION msg_message_search_update();
