import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class Curse implements IAbility {
  private static instance: Curse;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;

  constructor() {
    this.name = this.constructor.name;
    this.helpFile = `
help curse
CURSE
CURSE
Syntax: cast 'curse' <character>
This spell reduces the character's to-hit roll and save versus spells.
It also renders the character unclean in the eyes of the Gods and
unable to RECALL. Curse may be used to fill equipment with evil power,
allowing (for example) weapons to do more damage to particularly holy
opponents.
`;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;

    if (Curse.instance === undefined) {
      Curse.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): Curse {
    if (!Curse.instance) {
      Curse.instance = new Curse();
    }
    return Curse.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Curse.GetInstance() as T;
  }
}

export default Curse;
