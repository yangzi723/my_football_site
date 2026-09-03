# 定义路径
$projectRoot = "D:\team_jbm\my_football_site"
$backupRoot = "D:\backups"
$date = Get-Date -Format "yyyyMMdd_HHmmss"

# 确保备份目录存在
New-Item -ItemType Directory -Force -Path $backupRoot

# 备份数据库
Copy-Item "$projectRoot\football.db" "$backupRoot\football_$date.db" -Force

# 备份项目源代码（排除虚拟环境）
$codeDest = "$backupRoot\code_$date"
robocopy $projectRoot $codeDest /E /XD venv __pycache__ .git /NJH /NJS /NP
# 打包压缩
Compress-Archive -Path $codeDest -DestinationPath "$backupRoot\my_football_site_$date.zip" -Force
Remove-Item -Recurse -Force $codeDest

Write-Host "✅ 备份完成：$backupRoot\my_football_site_$date.zip"