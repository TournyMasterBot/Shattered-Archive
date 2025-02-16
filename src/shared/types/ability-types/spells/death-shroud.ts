import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class DeathShroud implements IAbility {
  private static instance: DeathShroud;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;

  constructor() {
    this.name = "Death Shroud";
    this.helpFile = `
DEATH SHROUD

Syntax: cast 'death shroud'

The Death Shroud is perhaps the most powerful spell under the Necromancy
flag. It creates an icy black aura around the Necromancer, which stifles
life and causes fear in most creatures. The shroud can be used both
actively and passively.

Anybody whom the Necromancer touches with hostile intent will be struck with
the Shroud, and suffer an immediate loss of life, and a temporary system
shock. Those who attempt to harm the Necromancer will find their weapons
passing cleanly through the aura, and never touching the Necromancer.
Furthermore, those who attempt to magick or touch the Necromancer without
his or her permission will be struck with the Shroud as though the
Necromancer actively cursed them with it.

The Shroud is an incredibly powerful tool, and requires a series of
conditions to be true before it can be successfully cast.

See also - NECROMANCY NECROMANCER`;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;

    if (DeathShroud.instance === undefined) {
      DeathShroud.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): DeathShroud {
    if (!DeathShroud.instance) {
      DeathShroud.instance = new DeathShroud();
    }
    return DeathShroud.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return DeathShroud.GetInstance() as T;
  }
}

export default DeathShroud;
