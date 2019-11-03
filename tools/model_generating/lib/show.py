from mpl_toolkits.mplot3d import Axes3D
import matplotlib.pyplot as plt

# input hand shape should be [5,4,6]
def show_hand(hand, fname=None):
    print(hand.shape)
    finger_colors = ["#000055", "#111155", "#222255", "#333355", "#444455"]
    fig, (ax) = plt.subplots(nrows=1, ncols=1, figsize=[7,5], subplot_kw=dict(projection='3d'))
    for finger in range(5):
        for bone in range(4):
            ax.plot(xs=hand[finger,bone,::3], ys=hand[finger,bone,1::3], zs=hand[finger,bone,2::3], color=finger_colors[finger], lw=6-bone)
    ax.scatter(0,0,0, s=5)
    view_scale=1

    #ax.set_aspect("equal")
    ax.set_xlabel("x")
    ax.set_ylabel("y")
    ax.set_zlabel("z")

    ax.set_xlim([-view_scale,view_scale])
    ax.set_ylim([-view_scale,view_scale])
    ax.set_zlim([-view_scale,view_scale])
    ax.view_init(elev=90, azim=-90)
    if fname is None:
        plt.show()
    else:
        plt.savefig(fname)
    plt.close()