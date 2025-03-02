import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import Nurishment from "@shared/types/ability-types/spells/nurishment";
import MentalDrain from "@shared/types/ability-types/spells/mental-drain";
import DivineIntervention from "@shared/types/ability-types/spells/divine-intervention";
import HolyPresence from "@shared/types/ability-types/spells/holy-presence";
import EnhancedRecovery from "@shared/types/ability-types/spells/enhanced-recovery";
import BindSoul from "@shared/types/ability-types/spells/bind-soul";
import MendWounds from "@shared/types/ability-types/spells/mend-wounds";
import Meteo from "@shared/types/ability-types/spells/meteo";
import Displacement from "@shared/types/ability-types/spells/displacement";
import Endurance from "@shared/types/ability-types/spells/endurance";
import CureDeafness from "@shared/types/ability-types/spells/cure-deafness";
import DispelCurse from "@shared/types/ability-types/spells/dispel-curse";
import Cornucopia from "@shared/types/ability-types/spells/cornucopia";
import FaerieFlames from "@shared/types/ability-types/spells/faerie-flames";
import HolyFlame from "@shared/types/ability-types/spells/holy-flames";
import ServerCache from "@shared/cache/server-cache";

export class DivineBlessings implements IAbilityGroup {
  static instance: DivineBlessings;
  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];
  public name: string;

  constructor() {
    this.name = this.constructor.name;
    this.abilityGroup = AbilityGroup.DivineBlessings;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilities = [
      HolyFlame.GetInstance(),
      Nurishment.GetInstance(),
      MentalDrain.GetInstance(),
      FaerieFlames.GetInstance(),
      DivineIntervention.GetInstance(),
      HolyPresence.GetInstance(),
      EnhancedRecovery.GetInstance(),
      BindSoul.GetInstance(),
      MendWounds.GetInstance(),
      Meteo.GetInstance(),
      Displacement.GetInstance(),
      Endurance.GetInstance(),
      CureDeafness.GetInstance(),
      DispelCurse.GetInstance(),
      Cornucopia.GetInstance(),
    ];
  }

  // Method to get the single instance of the class
  public static GetInstance(): DivineBlessings {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.AbilityGroups[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return DivineBlessings.GetInstance() as T;
  }
}

export default DivineBlessings;
