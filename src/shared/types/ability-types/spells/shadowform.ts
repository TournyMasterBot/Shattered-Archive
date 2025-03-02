import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class Shadowform implements IAbility {
  private static instance: Shadowform;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;
  manualDescription: string;

  constructor() {
    this.name = this.constructor.name;
    this.helpFile = `SHADOWFORM

Syntax: cast shadowform

The Shadowform spell draws upon the demi-plane of Shadow and replaces the
Necromancer's life force with essence from the demi-plane of Shadow. This
renders the Necromancer completely undetectable in all but the most blaring
light.

See also - NECROMANCY NECROMANCER`;
    this.manualDescription = "";
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;

    if (Shadowform.instance === undefined) {
      Shadowform.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): Shadowform {
    if (!Shadowform.instance) {
      Shadowform.instance = new Shadowform();
    }
    return Shadowform.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Shadowform.GetInstance() as T;
  }
}

export default Shadowform;
