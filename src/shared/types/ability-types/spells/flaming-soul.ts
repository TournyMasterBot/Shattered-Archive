import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class FlamingSoul implements IAbility {
  private static instance: FlamingSoul;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;

  constructor() {
    this.name = "Flaming Soul";
    this.helpFile = `
Flaming Soul:

Held up as a forbidden technique among the Wu Jen, it is believed that at
the core of every being is an untapped source of power that is rarely called
upon. The potential of such a thing carries the potential for greatness,
but also carries the risk of certain death. A practiced Wu Jen may channel
that power for a short time, becoming immune to all damage for the duration.
However, this comes at a price. If the Wu Jen is not slain outright by the
attempt to cast this spell, they will surely be at death's door when it
expires. All Wu Jen have the ability to cast this, should they choose.
`;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;

    if (FlamingSoul.instance === undefined) {
      FlamingSoul.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): FlamingSoul {
    if (!FlamingSoul.instance) {
      FlamingSoul.instance = new FlamingSoul();
    }
    return FlamingSoul.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return FlamingSoul.GetInstance() as T;
  }
}

export default FlamingSoul;
