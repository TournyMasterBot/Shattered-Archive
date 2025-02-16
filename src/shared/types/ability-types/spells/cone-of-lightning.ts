import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class ConeOfLightning implements IAbility {
  private static instance: ConeOfLightning;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;

  constructor() {
    this.name = "Cone of Lightning";
    this.helpFile = `
help cone of lightning
'CONE OF LIGHTNING'
CONE OF LIGHTNING

Syntax: cast 'cone of lightning'

By drawing on enormous amounts of energy, the Invoker calls into being a
cone of lightning from the skies above. The strikes of lightning affect all
that are in the same room as the Invoker, save for those the invoker is
grouped with.  

See also: INVOKER 
`;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;

    if (ConeOfLightning.instance === undefined) {
      ConeOfLightning.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): ConeOfLightning {
    if (!ConeOfLightning.instance) {
      ConeOfLightning.instance = new ConeOfLightning();
    }
    return ConeOfLightning.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return ConeOfLightning.GetInstance() as T;
  }
}

export default ConeOfLightning;
