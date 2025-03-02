import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class ConeOfCold implements IAbility {
  private static instance: ConeOfCold;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;

  constructor() {
    this.name = this.constructor.name;
    this.helpFile = `
CONE OF COLD

Syntax: cast 'cone of cold'

By drawing on enormous amounts of energy, the Invoker calls into being a
cone of bitter cold wind and precipitation from the iciest parts of the
world. The temperatures affect all that are in the same room as the
Invoker, save for those the invoker is grouped with.  

See also: INVOKER
`;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;

    if (ConeOfCold.instance === undefined) {
      ConeOfCold.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): ConeOfCold {
    if (!ConeOfCold.instance) {
      ConeOfCold.instance = new ConeOfCold();
    }
    return ConeOfCold.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return ConeOfCold.GetInstance() as T;
  }
}

export default ConeOfCold;
