import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class EntertainCrowd implements IAbility {
  private static instance: EntertainCrowd;

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
    this.name = this.constructor.name;
    this.abilityGroupType = AbilityGroupType.Skills;
    this.abilityUsage = AbilityUsage.Active;
    this.helpFile = `help entertain crowd
ENTERTAIN CROWD
 
Syntax:  Entertain crowd
 
Jongleurs more than any know that a happy fighter is a good fighter.  By
performing a short but grand display of athleticism, the jongleur will
entertain their audience of friend and foe alike, increasing their accuracy 
in combat as a result.`;

    if (EntertainCrowd.instance === undefined) {
      EntertainCrowd.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): EntertainCrowd {
    if (!EntertainCrowd.instance) {
      EntertainCrowd.instance = new EntertainCrowd();
    }
    return EntertainCrowd.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return EntertainCrowd.GetInstance() as T;
  }
}

export default EntertainCrowd;
