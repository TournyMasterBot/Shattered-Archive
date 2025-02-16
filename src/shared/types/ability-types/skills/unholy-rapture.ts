import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class UnholyRapture implements IAbility {
  private static instance: UnholyRapture;

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
    this.name = "Unholy Rapture";
    this.abilityGroupType = AbilityGroupType.Skills;
    this.abilityUsage = AbilityUsage.Active;
    this.helpFile = `
UNHOLY RAPTURE

Syntax: unholy <target>

The most powerful blessing bestowed upon the Knights of Shadow by
Necrucifer, the unholy rapture is a power called upon by His chosen
soldiers.  A Shadowknight may sacrifice much to call down the dark blessing
for himself or his allies, but the boon granted is great indeed, and not to
be taken lightly.
`;
  }

  // Method to get the single instance of the class
  public static GetInstance(): UnholyRapture {
    if (!UnholyRapture.instance) {
      UnholyRapture.instance = new UnholyRapture();
    }
    return UnholyRapture.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return UnholyRapture.GetInstance() as T;
  }
}

export default UnholyRapture;
