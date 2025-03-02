import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import AlterArmor from "@shared/types/ability-types/spells/alter-armor";
import AlterElements from "@shared/types/ability-types/spells/alter-element";
import AlterSelf from "@shared/types/ability-types/spells/alter-self";
import Blackstaff from "@shared/types/ability-types/spells/black-staff";
import Disjunction from "@shared/types/ability-types/spells/disjunction";
import Enlarge from "@shared/types/ability-types/spells/enlarge";
import Forget from "@shared/types/ability-types/spells/forget";
import FrostShroud from "@shared/types/ability-types/spells/frost-shroud";
import Permancy from "@shared/types/ability-types/spells/permancy";
import Reduce from "@shared/types/ability-types/spells/reduce";
import Regenerate from "@shared/types/ability-types/spells/regenerate";
import Solidify from "@shared/types/ability-types/spells/solidify";
import SummonManticore from "@shared/types/ability-types/spells/summon-manticore";
import WizardMark from "@shared/types/ability-types/spells/wizard-mark";
import ServerCache from "@shared/cache/server-cache";

export class Alteration implements IAbilityGroup {
  private static instance: Alteration;

  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];
  public name: string;

  constructor() {
    this.name = this.constructor.name;
    this.abilityGroup = AbilityGroup.Alteration;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilities = [
      Forget.GetInstance(),
      AlterSelf.GetInstance(),
      Reduce.GetInstance(),
      AlterArmor.GetInstance(),
      Blackstaff.GetInstance(),
      WizardMark.GetInstance(),
      FrostShroud.GetInstance(),
      Disjunction.GetInstance(),
      Regenerate.GetInstance(),
      SummonManticore.GetInstance(),
      Permancy.GetInstance(),
      Enlarge.GetInstance(),
      AlterElements.GetInstance(),
      Solidify.GetInstance()
    ];
  }

  // Method to get the single instance of the class
  public static GetInstance(): Alteration {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.AbilityGroups[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Alteration.GetInstance() as T;
  }
}

export default Alteration;
