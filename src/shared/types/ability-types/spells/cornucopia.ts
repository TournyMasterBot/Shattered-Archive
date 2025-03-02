import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class Cornucopia implements IAbility {
  private static instance: Cornucopia;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;

  constructor() {
    this.name = this.constructor.name;
    this.helpFile = `
cornucopia
Syntax: c 'cornucopia'

Tapping into the blessing of plenty, a priest of at least Deacon rank can
conjure a short-lived miracle of nourishment.  Rather than a singular
blessing, the power of Cornucopia will satisfy the hunger and thirst of
everybody nearby and will continue to do so for a short time.  It is said
that the closer one is to their God, the longer the spell will persist...
`;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;

    if (Cornucopia.instance === undefined) {
      Cornucopia.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): Cornucopia {
    if (!Cornucopia.instance) {
      Cornucopia.instance = new Cornucopia();
    }
    return Cornucopia.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Cornucopia.GetInstance() as T;
  }
}

export default Cornucopia;
