"""Trains the flow-matching toy that `../flow-matching.ts` draws, and writes everything it shows to flow-matching.json.

A small MLP learns the velocity field that carries Gaussian noise onto the Claude logo (flow matching with random
pairs), then learns it again from the pairs its own flow makes (Reflow, as in Rectified Flow). Every number the
scene shows comes from this run: the trajectories, the Euler paths and their end errors, the loss curves, the
directions at a crossing, the straightness of the paths and the share of one-step samples that land in the logo.

Run from this folder:  python3 flow-matching.py   (numpy, torch, pillow, cairosvg; about 2 min on a GPU, 6 on a CPU.
The committed JSON came from a GPU run; a CPU run gives slightly different numbers.)
Coordinates: the logo's 24-unit box maps to [-1, 1] on both axes, y down as in SVG. Errors are given as a share of
the logo's width (2 units).
"""
import base64, io, json, math, os, re
import numpy as np
import torch
import cairosvg
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
LOGO = os.path.join(HERE, '../../../lengths/scenes/logos/claude-color.svg')
OUT = os.path.join(HERE, 'flow-matching.json')
SEED, SIGMA, SIZE = 0, 0.5, 512
PARTICLES, FRAMES, DATASET = 2000, 25, 2000
DEVICE = 'cuda' if torch.cuda.is_available() else 'cpu'
torch.manual_seed(SEED)
rng = np.random.default_rng(SEED)

# The logo as a mask, and the dataset: points inside it.
svg = open(LOGO).read()
png = cairosvg.svg2png(bytestring=svg.encode(), output_width=SIZE, output_height=SIZE)
mask = np.array(Image.open(io.BytesIO(png)).convert('RGBA'))[:, :, 3] > 127
ys, xs = np.nonzero(mask)
pick = rng.choice(len(xs), DATASET, replace=False)
to_unit = lambda p: (p + 0.5) / SIZE * 2 - 1
data = np.stack([to_unit(xs[pick] + rng.random(DATASET) - 0.5), to_unit(ys[pick] + rng.random(DATASET) - 0.5)], 1).astype(np.float32)

def inside(points):
    px = np.clip(((points[:, 0] + 1) / 2 * SIZE).astype(int), 0, SIZE - 1)
    py = np.clip(((points[:, 1] + 1) / 2 * SIZE).astype(int), 0, SIZE - 1)
    ok = (np.abs(points) <= 1).all(1)
    return ok & mask[py, px]

class Net(torch.nn.Module):
    """v(x, t): the position and t as 8 sine/cosine pairs, four hidden layers of 256, 2 outputs."""
    def __init__(self):
        super().__init__()
        layers, width = [], 2 + 16
        for _ in range(4):
            layers += [torch.nn.Linear(width, 256), torch.nn.SiLU()]
            width = 256
        self.body = torch.nn.Sequential(*layers, torch.nn.Linear(256, 2))
        self.register_buffer('freq', math.pi * 2.0 ** torch.arange(8.0))
    def forward(self, x, t):
        return self.body(torch.cat([x, torch.sin(t * self.freq), torch.cos(t * self.freq)], 1))

def train(net, sample_pairs, steps, lr=1e-3, batch=1024, snap=None):
    """Flow matching: x_t = (1 - t) x0 + t x1, target x1 - x0. Returns the loss per step (smoothed)."""
    opt = torch.optim.Adam(net.parameters(), lr=lr)
    sched = torch.optim.lr_scheduler.CosineAnnealingLR(opt, steps)
    losses, ema = [], None
    for step in range(1, steps + 1):
        x0, x1 = sample_pairs(batch)
        t = torch.rand(batch, 1, device=DEVICE)
        xt = (1 - t) * x0 + t * x1
        loss = ((net(xt, t) - (x1 - x0)) ** 2).sum(1).mean()
        opt.zero_grad(); loss.backward(); opt.step(); sched.step()
        ema = loss.item() if ema is None else 0.98 * ema + 0.02 * loss.item()
        losses.append(ema)
        if snap: snap(step)
    return losses

@torch.no_grad()
def flow(net, x0, steps, frames=None, method='rk4'):
    """Integrates dx/dt = v(x, t) from t = 0 to 1; returns the positions at `frames` evenly spaced times (or the end)."""
    x, h, out = x0.clone(), 1 / steps, []
    keep = set(round(k * steps / (frames - 1)) for k in range(frames)) if frames else {steps}
    for i in range(steps + 1):
        if i in keep: out.append(x.clone())
        if i == steps: break
        t = torch.full((len(x), 1), i * h, device=x.device)
        if method == 'euler':
            x = x + h * net(x, t)
        else:
            k1 = net(x, t); k2 = net(x + h / 2 * k1, t + h / 2); k3 = net(x + h / 2 * k2, t + h / 2); k4 = net(x + h * k3, t + h)
            x = x + h / 6 * (k1 + 2 * k2 + 2 * k3 + k4)
    return torch.stack(out, 1)

def pack(array):
    """Float positions as little-endian int16 at 1/10000, base64: a quarter of the JSON size of decimals."""
    array = array.cpu().numpy() if torch.is_tensor(array) else array
    q = np.clip(np.round(np.asarray(array, dtype=np.float64) * 10000), -32767, 32767).astype('<i2')
    return base64.b64encode(q.tobytes()).decode()

def curve(losses, n=160):
    idx = np.unique(np.round(np.geomspace(1, len(losses), n)).astype(int)) - 1
    return [[int(i + 1), round(losses[i], 4)] for i in idx]

cpu = lambda x: x.detach().cpu().numpy()
share = lambda d: round(float(d) / 2, 4)
data_t = torch.from_numpy(data).to(DEVICE)
noise = lambda n: torch.randn(n, 2, device=DEVICE) * SIGMA
particles = torch.from_numpy(rng.standard_normal((PARTICLES, 2)).astype(np.float32)).to(DEVICE) * SIGMA

# Model 1: random pairs. Checkpoints of one highlighted training pair's predicted arrow, for the training shot.
pair_rng = np.random.default_rng(SEED + 1)
shown_pairs = 60
pairs_x0 = torch.from_numpy(pair_rng.standard_normal((shown_pairs, 2)).astype(np.float32)).to(DEVICE) * SIGMA
pairs_x1 = data_t[torch.from_numpy(pair_rng.choice(DATASET, shown_pairs, replace=False)).to(DEVICE)]
hi, hi_t = 7, 0.6
hi_xt = (1 - hi_t) * pairs_x0[hi:hi + 1] + hi_t * pairs_x1[hi:hi + 1]
net1, checkpoints = Net().to(DEVICE), []
ROUNDS1 = 30000
snap_at = {1, 30, 100, 300, 1000, 3000, 10000, ROUNDS1}
def snap1(step):
    if step in snap_at:
        with torch.no_grad(): v = net1(hi_xt, torch.full((1, 1), hi_t, device=DEVICE))[0]
        checkpoints.append([step, round(v[0].item(), 4), round(v[1].item(), 4)])
def random_pairs(n):
    return noise(n), data_t[torch.randint(0, DATASET, (n,), device=DEVICE)]
loss1 = train(net1, random_pairs, ROUNDS1, snap=snap1)
traj1 = flow(net1, particles, 96, FRAMES)

# One particle's Euler paths against its exact path: of the first 400, the one with the 10th-largest 4-step error,
# so the error is plain to see without being an outlier.
fine = flow(net1, particles[:400], 256, 65)
four = (flow(net1, particles[:400], 4, method='euler')[:, -1] - fine[:, -1]).norm(dim=1)
who = int(np.argsort(-cpu(four))[9])
euler = {}
for n in (4, 8, 16, 32):
    path = flow(net1, particles[who:who + 1], n, n + 1, method='euler')[0]
    euler[n] = {'path': np.round(cpu(path), 4).tolist(), 'error': share((path[-1] - fine[who, -1]).norm().item())}

# The field at a few times on a grid, for the velocity shot.
grid = np.stack(np.meshgrid(np.linspace(-1, 1, 13), np.linspace(-1, 1, 13)), -1).reshape(-1, 2).astype(np.float32)
with torch.no_grad():
    g = torch.from_numpy(grid).to(DEVICE)
    field = {str(t): np.round(cpu(net1(g, torch.full((len(grid), 1), t, device=DEVICE))), 4).tolist() for t in (0.0, 0.25, 0.5, 0.75, 1.0)}

# A crossing: at t = 0.5, the random-pair lines that pass within r of a point (24 shown, all of them averaged),
# and the model's arrow there, which is that average: the best a single arrow can do for crossing lines.
cross_rng = np.random.default_rng(SEED + 2)
cx0 = torch.from_numpy(cross_rng.standard_normal((400000, 2)).astype(np.float32)).to(DEVICE) * SIGMA
cx1 = data_t[torch.from_numpy(cross_rng.integers(0, DATASET, 400000)).to(DEVICE)]
mid = 0.5 * cx0 + 0.5 * cx1
point = torch.tensor([[0.05, 0.1]], device=DEVICE)
near = ((mid - point).norm(dim=1) < 0.05).nonzero().flatten()
with torch.no_grad(): mean_v = net1(point, torch.full((1, 1), 0.5, device=DEVICE))[0]
through = (cx1[near] - cx0[near])
shown = near[:24]
cross = {'t': 0.5, 'point': cpu(point[0]).tolist(), 'lines': np.round(cpu(torch.cat([cx0[shown], cx1[shown]], 1)), 4).tolist(), 'count': int(len(near)),
         'model': [round(mean_v[0].item(), 4), round(mean_v[1].item(), 4)],
         'average': [round(through[:, 0].mean().item(), 4), round(through[:, 1].mean().item(), 4)]}

# Reflow: pairs made by model 1's own flow, then model 2 learns straight lines between them (from model 1's weights).
z0 = noise(20000)
z1 = flow(net1, z0, 64)[:, -1]
def reflow_pairs(n):
    i = torch.randint(0, len(z0), (n,), device=DEVICE)
    return z0[i], z1[i]
net2 = Net().to(DEVICE); net2.load_state_dict(net1.state_dict())
ROUNDS2 = 4000
loss2 = train(net2, reflow_pairs, ROUNDS2, lr=5e-4)
traj2 = flow(net2, particles, 96, FRAMES)

def straightness(traj):
    """Total path length over total straight-line distance: 1 is straight."""
    path = (traj[:, 1:] - traj[:, :-1]).norm(dim=2).sum()
    return round((path / (traj[:, -1] - traj[:, 0]).norm(dim=1).sum()).item(), 4)

# Few-step sampling: each particle's end after n Euler steps, against its exact end (RK4, 96 steps) under the same model.
one = {}
for name, net, traj in (('m1', net1, traj1), ('m2', net2, traj2)):
    for steps in (1, 2, 4):
        end = flow(net, particles, steps, method='euler')[:, -1]
        one[f'{name}-{steps}'] = {'points': pack(end), 'error': share((end - traj[:, -1]).norm(dim=1).mean().item()), 'inside': round(float(inside(cpu(end)).mean()), 4)}
exact = {name: round(float(inside(cpu(traj[:, -1])).mean()), 4) for name, traj in (('m1', traj1), ('m2', traj2))}
params = sum(p.numel() for p in net1.parameters())

out = {
    'about': 'Generated by flow-matching.py; do not edit by hand.',
    'setup': {'seed': SEED, 'sigma': SIGMA, 'dataset': DATASET, 'particles': PARTICLES, 'frames': FRAMES, 'hidden': [256, 256, 256, 256],
              'parameters': params, 'rounds1': ROUNDS1, 'rounds2': ROUNDS2, 'batch': 1024, 'integrator': 'RK4, 96 steps', 'device': DEVICE},
    'm1': pack(traj1), 'm2': pack(traj2[:, ::(FRAMES - 1) // 4]), 'm2frames': 5,
    'euler': {'particle': who, 'exact': np.round(cpu(fine[who]), 4).tolist(), 'steps': euler},
    'field': {'grid': np.round(grid, 4).tolist(), 'v': field},
    'train': {'x0': np.round(cpu(pairs_x0), 4).tolist(), 'x1': np.round(cpu(pairs_x1), 4).tolist(), 'highlight': hi, 't': hi_t,
              'checkpoints': checkpoints, 'loss': curve(loss1)},
    'cross': cross,
    'reflow': {'x0': np.round(cpu(z0[:shown_pairs]), 4).tolist(), 'x1': np.round(cpu(z1[:shown_pairs]), 4).tolist(), 'loss': curve(loss2)},
    'straightness': {'m1': straightness(traj1), 'm2': straightness(traj2)},
    'onestep': one, 'inside': exact,
}
json.dump(out, open(OUT, 'w'), separators=(',', ':'))
print(json.dumps({'parameters': params, 'loss1': round(loss1[-1], 4), 'loss2': round(loss2[-1], 4), 'straightness': out['straightness'],
                  'inside_exact': exact, 'onestep': {k: (v['error'], v['inside']) for k, v in one.items()}, 'euler_error': {n: e['error'] for n, e in euler.items()},
                  'cross_lines': len(near), 'cross_model': cross['model'], 'cross_average': cross['average'], 'checkpoints': checkpoints, 'device': DEVICE,
                  'bytes': os.path.getsize(OUT)}, indent=1))
