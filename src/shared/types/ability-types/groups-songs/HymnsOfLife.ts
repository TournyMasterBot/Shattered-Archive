import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import SongOfHealing from "@shared/types/ability-types/songs/song-of-healing";
import TorchBurns from "@shared/types/ability-types/songs/torch-burns";
import WakeTheDead from "@shared/types/ability-types/songs/wake-the-dead";
import MarriageSong from "@shared/types/ability-types/songs/marriage-song";
import TravelTune from "@shared/types/ability-types/songs/travel-tune";
import BottlesOfBeer from "@shared/types/ability-types/songs/bottles-of-beer";
import RevealAll from "@shared/types/ability-types/songs/reveal-all";
import SongOfPeace from "@shared/types/ability-types/songs/song-of-peace";
import StoneFountain from "@shared/types/ability-types/songs/stone-fountain";
import ShieldOfWords from "@shared/types/ability-types/songs/shield-of-words";
import RoostersCrow from "@shared/types/ability-types/songs/roosters-crow";
import ServerCache from "@shared/cache/server-cache";

export class HymnsOfLife implements IAbilityGroup {
  static instance: HymnsOfLife;
  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];
  public name: string;

  constructor() {
    this.name = this.constructor.name;
    this.abilityGroup = AbilityGroup.HymnsOfLife;
    this.abilityGroupType = AbilityGroupType.Songs;
    this.abilities = [
      SongOfHealing.GetInstance(),
      TorchBurns.GetInstance(),
      WakeTheDead.GetInstance(),
      MarriageSong.GetInstance(),
      TravelTune.GetInstance(),
      BottlesOfBeer.GetInstance(),
      RevealAll.GetInstance(),
      SongOfPeace.GetInstance(),
      StoneFountain.GetInstance(),
      ShieldOfWords.GetInstance(),
      RoostersCrow.GetInstance(),
    ];
  }

  // Method to get the single instance of the class
  public static GetInstance(): HymnsOfLife {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.AbilityGroups[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return HymnsOfLife.GetInstance() as T;
  }
}

export default HymnsOfLife;
