from database import get_db

def print_fixtures():
    with get_db() as conn:
        cur = conn.execute("SELECT id, date, time, league, home_team, away_team FROM fixtures ORDER BY date, time")
        rows = cur.fetchall()
        if not rows:
            print("暂无赛事")
            return
        print("ID\t日期\t\t时间\t联赛\t主队\t客队")
        print("-" * 60)
        for row in rows:
            print(f"{row['id']}\t{row['date']}\t{row['time']}\t{row['league']}\t{row['home_team']}\t{row['away_team']}")

if __name__ == "__main__":
    print("=== 赛事列表 ===")
    print_fixtures()