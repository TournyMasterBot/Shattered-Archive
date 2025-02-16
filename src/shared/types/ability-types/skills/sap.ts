import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class Sap implements IAbility {
  private static instance: Sap;

  name: string;
  helpFile: string;
  manualDescription?: string | undefined;
  duration?: number | undefined;
  effects?: SkillSpellEffects | undefined;
  group?: string | undefined;
  alternateKeyword?: string | undefined;
  recommendedHelpFileChanges?: string | undefined;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;

  constructor() {
    this.name = "Sap";
    this.abilityGroupType = AbilityGroupType.Skills;
    this.abilityUsage = AbilityUsage.Active;
    this.helpFile = `
SAP

A charlatan, being the trickster that they are, tends to be well versed in
the art of sneaking around an opponent.  One advantage of this is evident
when a charlatan sneaks around an opponent and attempts to sap their
strength.  

A successful sap may very well drop an opponent to the floor, unconscious
for a short time.  Obviously, such success is limited to how large a
charlatan is in regard to their opponent.  
 
See also : Help Charlatan
`;

    if (Sap.instance === undefined) {
      Sap.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): Sap {
    if (!Sap.instance) {
      Sap.instance = new Sap();
    }
    return Sap.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Sap.GetInstance() as T;
  }
}

export default Sap;
