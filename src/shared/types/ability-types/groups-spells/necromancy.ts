import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import BoneBlight from "@shared/types/ability-types/spells/BoneBlight";
import AnimateDead from "@shared/types/ability-types/spells/AnimateDead";
import Embalm from "@shared/types/ability-types/spells/Embalm";
import DeathShroud from "@shared/types/ability-types/spells/DeathShroud";
import BlackCurse from "@shared/types/ability-types/spells/BlackCurse";
import Regenerate from "@shared/types/ability-types/spells/Regenerate";
import Scourge from "@shared/types/ability-types/spells/Scourge";
import FeignDeath from "@shared/types/ability-types/spells/FeignDeath";
import GraftFlesh from "@shared/types/ability-types/spells/GraftFlesh";
import WithstandDeath from "@shared/types/ability-types/spells/WithstandDeath";
import SoulHarvest from "@shared/types/ability-types/spells/SoulHarvest";
import Solidify from "@shared/types/ability-types/spells/Solidify";
import Shadowform from "@shared/types/ability-types/spells/Shadowform";
import Empath from "@shared/types/ability-types/spells/Empath";
import LocateRemains from "@shared/types/ability-types/spells/LocateRemains";
import CorpseHost from "@shared/types/ability-types/spells/CorpseHost";
import PreventRecovery from "@shared/types/ability-types/spells/PreventRecovery";
import BodrumsBoils from "@shared/types/ability-types/spells/BodrumsBoils";
import ServerCache from "@shared/cache/server-cache";

export class Necromancy implements IAbilityGroup {
  private static instance: Necromancy;

  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];
  public name: string;

  constructor() {
    this.name = this.constructor.name;
    this.abilityGroup = AbilityGroup.Necromancy;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilities = [
      BoneBlight.GetInstance(),
      AnimateDead.GetInstance(),
      Embalm.GetInstance(),
      DeathShroud.GetInstance(),
      BlackCurse.GetInstance(),
      Regenerate.GetInstance(),
      Scourge.GetInstance(),
      FeignDeath.GetInstance(),
      GraftFlesh.GetInstance(),
      WithstandDeath.GetInstance(),
      SoulHarvest.GetInstance(),
      Solidify.GetInstance(),
      Shadowform.GetInstance(),
      Empath.GetInstance(),
      LocateRemains.GetInstance(),
      CorpseHost.GetInstance(),
      PreventRecovery.GetInstance(),
      BodrumsBoils.GetInstance(),
    ];
  }

  // Method to get the single instance of the class
  public static GetInstance(): Necromancy {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.AbilityGroups[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Necromancy.GetInstance() as T;
  }
}

export default Necromancy;
