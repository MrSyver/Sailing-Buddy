import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { openDatabase, bufferSource } from './js/lib/sqlite.js';
execFileSync('python3',['-c',`
import sqlite3, os
p='/tmp/dbg.sqlite'
os.path.exists(p) and os.remove(p)
db=sqlite3.connect(p)
db.execute("CREATE TABLE tiles (zoom_level integer, tile_column integer, tile_row integer, tile_data blob)")
rows=[]
for z in range(0,8):
    n=2**z
    for x in range(0,min(n,12)):
        for y in range(0,min(n,12)):
            rows.append((z,x,y,bytes([(z*31+x*7+y)%251])*300))
db.executemany("INSERT INTO tiles VALUES (?,?,?,?)",rows)
db.execute("CREATE UNIQUE INDEX tile_index on tiles (zoom_level, tile_column, tile_row)")
db.commit(); db.close()
print(len(rows),'Zeilen')
`],{stdio:'inherit'});
const db = await openDatabase(bufferSource(readFileSync('/tmp/dbg.sqlite')));
const schema = await db.schema();
console.log(schema.map(s=>`${s.type} ${s.name} root=${s.root}`).join('\n'));
const idxRoot = schema.find(s=>s.name==='tile_index').root;
const page = await db.page(idxRoot);
console.log('Indexwurzel Seitenart:', page[0], '(2=innen, 10=Blatt)');
console.log('Zellen:', (page[3]<<8)|page[4]);
console.log('rowidFromIndex(0,0,0) =', await db.rowidFromIndex(idxRoot,[0,0,0]));
console.log('rowidFromIndex(3,5,2) =', await db.rowidFromIndex(idxRoot,[3,5,2]));
