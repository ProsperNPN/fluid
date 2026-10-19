"""Run separately from API: python -m app.scripts.run_alert_worker [--once]."""
import asyncio
import argparse
import logging
from app.core.database import AsyncSessionLocal
from app.services.smart_inventory import monitor_inventory
from app.services.appointment_scheduling import send_reminders
from app.services.alert_worker import scan_requests, process_delivery


async def run(once=False):
    while True:
        try:
            await scan_requests(AsyncSessionLocal)
            await send_reminders(AsyncSessionLocal)
            await monitor_inventory(AsyncSessionLocal)
            for _ in range(100):
                if not await process_delivery(AsyncSessionLocal):
                    break
        except Exception:
            logging.getLogger(__name__).exception("Alert worker tick failed")
            if once:
                raise
        if once:
            return
        await asyncio.sleep(10)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--once", action="store_true")
    asyncio.run(run(parser.parse_args().once))
