import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class DualWield implements IAbility {
  private static instance: DualWield;

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
    this.name = "DualWield";
    this.abilityGroupType = AbilityGroupType.Skills;
    this.abilityUsage = AbilityUsage.Passive;
    this.helpFile = `help 'dual wield'
dual wield
DUAL WIELD
syntax: hold <primary weapon>
        secondary <secondary weapon>
Under the tutelage of a weapons expert, a combatant may learn how to wield a
weapon in each hand during combat to increase the overall amount of attacks
each round of attack.  Obviously, with a weapon in each hand, there is no
possibility of holding a shield.  Since most people favor one hand more than
the other, the combatant typically finds that he can hold a heavy weapon
with his proficient hand and a lighter weapon with the other.  Rangers,
however, have the single ability to dual wield weapons of the same weight.
Note:  If the primary weapon is somehow removed, the secondary weapon
automatically switches to the the primary hand.
 
To dual wield, one must type second <weapon>. The only restriction is
that the secondary weapon must weigh less than the primary weapon. However,
there are some known classes out there that might be able to wield two
weapons of the same weight as well as be able to dual wield two handed
weapons.`;

    if (DualWield.instance === undefined) {
      DualWield.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): DualWield {
    if (!DualWield.instance) {
      DualWield.instance = new DualWield();
    }
    return DualWield.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return DualWield.GetInstance() as T;
  }
}

export default DualWield;
