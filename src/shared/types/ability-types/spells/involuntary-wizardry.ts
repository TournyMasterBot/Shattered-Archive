import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class InvoluntaryWizardry implements IAbility {
  private static instance: InvoluntaryWizardry;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;
  manualDescription: string;

  constructor() {
    this.name = this.constructor.name;
    this.helpFile = `
INVOLUNTARY WIZARDRY

Syntax: cast 'involuntary wizardry' <victim>

Involuntary wizardry allows the caster to cause the victim to cast a random
spell upon themselves. If the victim cannot cast spells, then the
involuntary wizardry will be ineffective.
`;
    this.manualDescription = "";
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;

    if (InvoluntaryWizardry.instance === undefined) {
      InvoluntaryWizardry.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): InvoluntaryWizardry {
    if (!InvoluntaryWizardry.instance) {
      InvoluntaryWizardry.instance = new InvoluntaryWizardry();
    }
    return InvoluntaryWizardry.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return InvoluntaryWizardry.GetInstance() as T;
  }
}

export default InvoluntaryWizardry;
